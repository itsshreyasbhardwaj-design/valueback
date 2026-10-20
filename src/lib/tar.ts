/**
 * Minimal POSIX ustar writer, gzipped by the caller.
 * ponytail: Node ships zlib but no zip; a tar header is 15 lines and avoids
 * pulling an archive library in for one export button.
 */
export type TarEntry = { name: string; data: Uint8Array; mode?: number; mtime?: Date };

function header(entry: TarEntry): Buffer {
  const h = Buffer.alloc(512, 0);
  const write = (s: string, offset: number, len: number) =>
    h.write(s.slice(0, len - 1).padEnd(len, '\0'), offset, len, 'utf8');
  const octal = (n: number, offset: number, len: number) =>
    h.write(n.toString(8).padStart(len - 1, '0') + '\0', offset, len, 'ascii');

  const name = entry.name.replace(/^\/+/, '').slice(0, 99);
  write(name, 0, 100);
  octal(entry.mode ?? 0o600, 100, 8);
  octal(0, 108, 8); // uid
  octal(0, 116, 8); // gid
  octal(entry.data.length, 124, 12);
  octal(Math.floor((entry.mtime ?? new Date()).getTime() / 1000), 136, 12);
  h.write('        ', 148, 8, 'ascii'); // checksum placeholder
  h.write('0', 156, 1, 'ascii'); // regular file
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');

  let sum = 0;
  for (const byte of h) sum += byte;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return h;
}

export function createTar(entries: TarEntry[]): Buffer {
  const parts: Uint8Array[] = [];
  for (const entry of entries) {
    parts.push(header(entry), entry.data);
    const pad = (512 - (entry.data.length % 512)) % 512;
    if (pad) parts.push(Buffer.alloc(pad, 0));
  }
  parts.push(Buffer.alloc(1024, 0)); // two empty blocks terminate the archive
  return Buffer.concat(parts);
}
