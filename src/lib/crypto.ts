import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

/* ----------------------------------------------------------- hashing ---- */

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Password hashing with scrypt (RFC 7914) from node:crypto.
 * Chosen over argon2id because it is memory-hard, reputable, and needs no
 * native build step — see SECURITY.md "Password hashing" for the trade-off.
 * N=2^15, r=8, p=1  ->  ~32 MB of memory per verification.
 */
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 96 * 1024 * 1024 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize('NFKC'), salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts as [string, string, string, string, string, string];
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');
  let actual: Buffer;
  try {
    actual = scryptSync(password.normalize('NFKC'), salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
    });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* -------------------------------------------------------- tokens -------- */

/** URL-safe opaque token for sessions and invites. */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function newUuid(): string {
  return randomUUID();
}

/** Human-typeable recovery code, e.g. "7K3Q-9ZTM-4B2F". */
export function newRecoveryCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
  const pick = (n: number) =>
    Array.from(randomBytes(n), (b) => alphabet[b % alphabet.length]).join('');
  return `${pick(4)}-${pick(4)}-${pick(4)}`;
}

export function normaliseRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/* ----------------------------------------------- authenticated encryption */

function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'APP_ENCRYPTION_KEY is not set. Run `npm run setup` to generate local secrets.',
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded (see ENVIRONMENT.md).');
  }
  return buf;
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext>, all base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

/** Returns null when the envelope is malformed or fails authentication. */
export function decryptSecret(envelope: string): string | null {
  const parts = envelope.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key(),
      Buffer.from(parts[1]!, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(parts[2]!, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3]!, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

/** Safe-to-display tail of a secret, e.g. "••••4321". Never the full value. */
export function codeHint(code: string): string {
  const tail = code.replace(/\s/g, '').slice(-4);
  return `••••${tail}`;
}
