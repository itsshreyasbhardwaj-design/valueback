/**
 * Minimal RFC-5322 reader: enough to pull the readable body and the headers we
 * care about out of a saved email. No dependency — a full MIME library would be
 * a lot of surface area for "find the text part".
 */
export type ParsedEmail = {
  from: string;
  fromName: string;
  fromDomain: string;
  subject: string;
  date: string | null;
  text: string;
};

function decodeQuotedPrintable(s: string): string {
  return s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(Number.parseInt(h, 16)));
}

/** =?utf-8?B?...?= / =?utf-8?Q?...?= encoded-words in headers. */
function decodeHeaderWords(s: string): string {
  return s.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_, charset: string, enc: string, data: string) => {
      try {
        const buf =
          enc.toUpperCase() === 'B'
            ? Buffer.from(data, 'base64')
            : Buffer.from(decodeQuotedPrintable(data.replace(/_/g, ' ')), 'latin1');
        return buf.toString(
          (charset.toLowerCase() === 'utf-8' ? 'utf8' : 'latin1') as BufferEncoding,
        );
      } catch {
        return data;
      }
    },
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitHeaders(raw: string): { headers: Map<string, string>; body: string } {
  const idx = raw.search(/\r?\n\r?\n/);
  const headerBlock = idx === -1 ? raw : raw.slice(0, idx);
  const body = idx === -1 ? '' : raw.slice(idx).replace(/^\r?\n\r?\n/, '');
  const headers = new Map<string, string>();
  // unfold continuation lines before splitting
  for (const line of headerBlock.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (m) headers.set(m[1]!.toLowerCase(), decodeHeaderWords(m[2]!.trim()));
  }
  return { headers, body };
}

function decodeBody(body: string, headers: Map<string, string>): string {
  const enc = (headers.get('content-transfer-encoding') ?? '').toLowerCase();
  if (enc.includes('base64')) {
    try {
      return Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8');
    } catch {
      return body;
    }
  }
  if (enc.includes('quoted-printable')) return decodeQuotedPrintable(body);
  return body;
}

/** Depth-limited walk of multipart bodies; prefers text/plain over text/html. */
function extractText(body: string, headers: Map<string, string>, depth = 0): string {
  const contentType = headers.get('content-type') ?? 'text/plain';
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(contentType)?.[1];

  if (boundary && depth < 4) {
    const parts = body.split(
      new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?`),
    );
    const decoded: Array<{ type: string; text: string }> = [];
    for (const part of parts.slice(1)) {
      const trimmed = part.replace(/^\r?\n/, '');
      if (!trimmed.trim()) continue;
      const sub = splitHeaders(trimmed);
      const subType = (sub.headers.get('content-type') ?? 'text/plain').toLowerCase();
      const text = subType.includes('multipart')
        ? extractText(sub.body, sub.headers, depth + 1)
        : decodeBody(sub.body, sub.headers);
      decoded.push({ type: subType, text });
    }
    const plain = decoded.find((d) => d.type.includes('text/plain'));
    if (plain?.text.trim()) return plain.text;
    const html = decoded.find((d) => d.type.includes('text/html'));
    if (html?.text.trim()) return stripHtml(html.text);
    return decoded
      .map((d) => d.text)
      .join('\n')
      .trim();
  }

  const decoded = decodeBody(body, headers);
  return contentType.toLowerCase().includes('text/html') ? stripHtml(decoded) : decoded;
}

export function parseEml(raw: string): ParsedEmail {
  const { headers, body } = splitHeaders(raw);
  const fromRaw = headers.get('from') ?? '';
  const addr = /<([^>]+)>/.exec(fromRaw)?.[1] ?? (fromRaw.includes('@') ? fromRaw.trim() : '');
  const name = fromRaw
    .replace(/<[^>]*>/, '')
    .replace(/["']/g, '')
    .trim();
  const dateHeader = headers.get('date');
  let date: string | null = null;
  if (dateHeader) {
    const parsed = new Date(dateHeader);
    if (!Number.isNaN(parsed.getTime())) date = parsed.toISOString().slice(0, 10);
  }
  return {
    from: addr,
    fromName: name,
    fromDomain: addr.split('@')[1] ?? '',
    subject: headers.get('subject') ?? '',
    date,
    text: extractText(body, headers).replace(/\r/g, '').trim(),
  };
}

export function looksLikeEml(raw: string): boolean {
  const head = raw.slice(0, 2000);
  return /^(from|to|subject|date|received|message-id|mime-version|content-type|return-path|delivered-to|x-[a-z-]+):/im.test(
    head,
  );
}
