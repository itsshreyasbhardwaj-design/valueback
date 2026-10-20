import type { Metadata } from 'next';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { ShieldCheck } from 'lucide-react';
import { requireUser, userSessions } from '@/lib/auth';
import { db } from '@/lib/db';
import { recoveryCodes } from '@/lib/db/schema';
import { timestamp } from '@/lib/format';
import { Alert, Card, CardHeader } from '@/components/ui';
import {
  DeleteAccountPanel,
  PasswordForm,
  RecoveryCodesPanel,
  RevokeSessionsPanel,
} from '../panels';

export const metadata: Metadata = { title: 'Security' };

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const prefs = { dateFormat: user.settings.dateFormat };

  const unusedCodes =
    db
      .select({ n: sql<number>`count(*)` })
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, user.id), isNull(recoveryCodes.usedAt)))
      .get()?.n ?? 0;
  const sessions = userSessions(user.id);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {sp.recovered ? (
          <Alert tone="positive" title="Password reset with a recovery code">
            That code has been used up. Generate a fresh set below so you are not left without one.
          </Alert>
        ) : null}

        <Card>
          <CardHeader
            title="Change your password"
            description="Changing it signs out every other device."
          />
          <PasswordForm />
        </Card>

        <Card>
          <CardHeader
            title="Recovery codes"
            description="The only way back in if you forget your password."
          />
          <RecoveryCodesPanel existing={unusedCodes} />
        </Card>

        <Card>
          <CardHeader
            title="Active sessions"
            description="Sessions are stored server-side; only a hash of each cookie is kept."
          />
          <ul className="divide-y divide-[var(--border)] text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="px-4 py-2.5">
                <p className="truncate">{s.userAgent || 'Unknown device'}</p>
                <p className="text-xs text-[var(--text-faint)]">
                  Started {timestamp(s.createdAt, prefs)} · expires {timestamp(s.expiresAt, prefs)}
                </p>
              </li>
            ))}
          </ul>
          <div className="border-t border-[var(--border)]">
            <RevokeSessionsPanel count={sessions.length} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Delete your account"
            description="Permanent, immediate, and not recoverable."
          />
          <DeleteAccountPanel />
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck size={15} className="text-[var(--accent)]" aria-hidden /> What protects
            this account
          </h2>
          <ul className="mt-2 space-y-1.5 text-[0.8125rem] text-[var(--text-muted)]">
            <li>
              • Passwords hashed with scrypt (memory-hard), never stored or logged in plain text.
            </li>
            <li>
              • Sessions held server-side; the cookie is HTTP-only and only its hash is in the
              database.
            </li>
            <li>• Sign-in, password change and recovery attempts are rate limited.</li>
            <li>• Every record read and write re-checks ownership on the server.</li>
            <li>
              • Gift-card codes are encrypted with AES-256-GCM using a key from your local
              environment file.
            </li>
          </ul>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold">What does not exist here</h2>
          <ul className="mt-2 space-y-1.5 text-[0.8125rem] text-[var(--text-muted)]">
            <li>• No email verification and no password-reset email — no provider is connected.</li>
            <li>• No two-factor authentication yet.</li>
            <li>• No independent security assessment has been carried out on this build.</li>
          </ul>
        </Card>

        <Alert tone="neutral" title="If you lose your key">
          Redemption codes are encrypted with APP_ENCRYPTION_KEY from your local environment file.
          Replacing that key makes previously saved codes unreadable — everything else keeps
          working.
        </Alert>
      </div>
    </div>
  );
}
