import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, Bug, LifeBuoy, ShieldAlert } from 'lucide-react';
import { Alert, Card } from '@/components/ui';

export const metadata: Metadata = { title: 'Contact and support', description: 'How to get help with ValueBack.' };

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold">Contact and support</h1>
      <p className="mt-3 text-[var(--text-muted)]">
        ValueBack is a self-hosted build with no support desk behind it. Here is what genuinely exists.
      </p>

      <Alert tone="info" title="No contact form, on purpose" className="mt-6">
        A form that posts into a void would look like support without being support. There is no email
        provider configured in this build, so nothing typed into a form here could reach anyone. The
        routes below are the real ones.
      </Alert>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <BookOpen size={18} className="text-[var(--accent)]" aria-hidden />
          <h2 className="mt-2.5 font-semibold">Read the documentation</h2>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">
            The repository ships README, ARCHITECTURE, FEATURES, SECURITY, TESTING, ROADMAP and
            ENVIRONMENT files. They describe what is implemented, what is not, and why.
          </p>
        </Card>
        <Card className="p-5">
          <LifeBuoy size={18} className="text-[var(--accent)]" aria-hidden />
          <h2 className="mt-2.5 font-semibold">Common questions</h2>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">
            The{' '}
            <Link href="/faq" className="underline">
              FAQ
            </Link>{' '}
            covers data storage, recovery without email, reminder limits and what the document reader
            does and does not do.
          </p>
        </Card>
        <Card className="p-5">
          <Bug size={18} className="text-[var(--accent)]" aria-hidden />
          <h2 className="mt-2.5 font-semibold">Something is broken</h2>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">
            Because you are running the app yourself, the server console is the first place to look. Note
            what you did, what you expected and what happened, and raise it wherever you obtained the
            code.
          </p>
        </Card>
        <Card className="p-5">
          <ShieldAlert size={18} className="text-[var(--accent)]" aria-hidden />
          <h2 className="mt-2.5 font-semibold">A security problem</h2>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">
            Report it privately to whoever operates your installation rather than posting the details
            publicly. SECURITY.md lists the threats this build does and does not defend against.
          </p>
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-semibold">Recovering an account</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          There is no password-reset email. If you are signed in, generate recovery codes in Settings and
          store them somewhere safe — a code lets you set a new password. If you have lost both the
          password and every code, nobody can restore the account; the data is encrypted at rest with
          keys held by your installation, not by any service.
        </p>
      </Card>
    </div>
  );
}
