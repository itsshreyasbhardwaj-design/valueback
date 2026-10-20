/**
 * Runtime configuration must stay runtime configuration.
 *
 * Next.js inlines statically-written `process.env.NAME` references with the
 * values found in .env files at BUILD time. That means a build produced on one
 * machine would silently keep that machine's database path and secrets, even
 * when the server is later started with different values — a nasty way to
 * discover your production deployment is writing to a developer's file.
 *
 * Reading through a dynamic key cannot be statically replaced, so every value
 * below is resolved from the real environment when it is asked for.
 */
export function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

export function requireEnv(name: string, hint: string): string {
  const value = readEnv(name);
  if (!value) throw new Error(`${name} is not set. ${hint}`);
  return value;
}
