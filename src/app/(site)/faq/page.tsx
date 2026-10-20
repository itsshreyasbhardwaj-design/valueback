import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Straight answers about what ValueBack does, what it does not do, and where your data lives.',
};

const FAQS: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: 'Does ValueBack connect to my bank or to the shops I buy from?',
    a: (
      <>
        No. There is no bank connection, no card link and no merchant integration. Every balance in
        ValueBack is one you recorded or accepted from a document you uploaded. That is why the app is
        careful to say where each number came from.
      </>
    ),
  },
  {
    q: 'Can it get my money back for me?',
    a: (
      <>
        No. It keeps your evidence together, watches the deadlines, and drafts a follow-up message you
        can send. Whether a merchant pays is between you and them. Nothing is counted as recovered until
        you confirm you received it.
      </>
    ),
  },
  {
    q: 'Where is my data stored?',
    a: (
      <>
        In a database file and a storage folder on the machine running the app. Uploaded documents are
        written outside the web root and are only served to the account that owns them. Nothing is sent
        to an external service — there are no third-party API calls in the product at all.
      </>
    ),
  },
  {
    q: 'Is my gift-card code safe?',
    a: (
      <>
        Codes are encrypted with AES-256-GCM using a key kept in a local environment file that is never
        committed to version control. The interface shows a masked hint such as ••••4321 and reveals the
        full code only when you explicitly ask. Codes are never written to logs and are not searchable.
      </>
    ),
  },
  {
    q: 'How does document reading work? Is it an AI model?',
    a: (
      <>
        No. It is deterministic parsing: text is pulled out of the PDF, email or image, then matched
        against rules for amounts, dates, order numbers and codes. It proposes values with a confidence
        level and the snippet it read them from, and you confirm or correct each one. Calling that
        &ldquo;AI&rdquo; would be marketing, not description.
      </>
    ),
  },
  {
    q: 'What happens when something expires?',
    a: (
      <>
        The record is flagged for review, not written off. An expiry date in your notes is evidence about
        the terms, not proof that the right has ended — merchants extend credits, and some rules differ
        from the printed date. You decide whether to mark it used, revalidated or genuinely expired.
      </>
    ),
  },
  {
    q: 'Will reminders reach me if the app is closed?',
    a: (
      <>
        No, and the app says so where reminders are configured. Reminders are processed while ValueBack
        is running, or when the bundled scheduler command is run. Browser notifications work only while
        a tab is open and you have granted permission. Push delivery to a closed app needs a push service
        that is not part of this build.
      </>
    ),
  },
  {
    q: 'I forgot my password. Can you email me a reset link?',
    a: (
      <>
        No — there is no email provider configured, and a reset link that goes nowhere would be worse
        than useless. Instead, generate recovery codes in Settings while you are signed in and keep them
        somewhere safe. A recovery code lets you set a new password. Without one, the account cannot be
        recovered.
      </>
    ),
  },
  {
    q: 'Can my partner and I track things together?',
    a: (
      <>
        Yes. Create a household and send an invitation link you copy and pass on yourself. Sharing is per
        record: joining a household shows the other person nothing until you share a specific item with
        it, and you can revoke that at any time.
      </>
    ),
  },
  {
    q: 'Can I get my data out?',
    a: (
      <>
        Yes. CSV per record type, a full JSON export, or a .tar.gz archive with the JSON plus every file
        you uploaded. Redemption codes are left out unless you ask for them and re-enter your password.
        You can also delete the account, which removes the records and the stored files.
      </>
    ),
  },
  {
    q: 'Is it safe to use for real money?',
    a: (
      <>
        It stores records about money; it never holds or moves any. The build follows standard practices —
        hashed passwords, server-side authorisation checks, encrypted codes, validated uploads — but it
        has not had an independent security review. Treat it as a careful personal tool rather than
        audited financial software.
      </>
    ),
  },
  {
    q: 'What does it cost?',
    a: (
      <>
        Nothing. There is no payment system in this build, so every account runs on the Free plan. The{' '}
        <Link href="/pricing" className="underline">
          pricing page
        </Link>{' '}
        shows provisional plans for later.
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold">Questions, answered plainly</h1>
      <p className="mt-3 text-[var(--text-muted)]">
        If something here is vague, that is a bug. Tell us on the{' '}
        <Link href="/contact" className="underline">
          contact page
        </Link>
        .
      </p>

      <dl className="mt-10 divide-y divide-[var(--border)]">
        {FAQS.map((f) => (
          <div key={f.q} className="py-5">
            <dt className="text-base font-semibold">{f.q}</dt>
            <dd className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--text-muted)]">{f.a}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
