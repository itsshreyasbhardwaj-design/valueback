import type { Metadata } from 'next';
import { Alert } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'Draft terms for using ValueBack.',
};

const UPDATED = '20 October 2026';

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold">Terms of service</h1>
      <p className="mt-2 text-sm text-[var(--text-faint)]">Draft · last updated {UPDATED}</p>

      <Alert tone="warning" title="This is an initial draft" className="mt-5">
        Written to describe how the software behaves, not as a finished contract. It needs review by
        a qualified lawyer before ValueBack is offered to anyone publicly.
      </Alert>

      <div className="mt-8 space-y-6 text-[0.9375rem] leading-relaxed text-[var(--text-muted)]">
        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">1. What ValueBack is</h2>
          <p className="mt-2">
            ValueBack is a personal record-keeping tool for benefits you already hold or expect to
            receive: gift cards, store credits, refunds, coupons, prepaid packages and similar. It
            organises information you provide and reminds you about dates you record.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">2. What ValueBack is not</h2>
          <p className="mt-2">
            It is not a bank, a wallet, a payment processor, an investment platform or a financial
            adviser. It does not hold, transfer, redeem or guarantee any money or benefit. It has no
            relationship with any merchant, card issuer or loyalty programme, and cannot act on your
            behalf with them.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">3. Accuracy of records</h2>
          <p className="mt-2">
            Every figure in the app comes from you, or from a document you uploaded and then
            confirmed. Automatic reading of documents is best-effort pattern matching and can be
            wrong; that is why nothing is saved without your confirmation. You are responsible for
            the accuracy of what you record, and for checking the real balance with the provider
            before relying on it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">4. Reminders</h2>
          <p className="mt-2">
            Reminders are a convenience, not a guarantee. They are generated while the application
            or its scheduler is running. Missing a deadline remains your responsibility. Do not rely
            on ValueBack as the only safeguard for a time-limited right.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">5. Your account</h2>
          <p className="mt-2">
            Keep your password and any recovery codes safe. There is no email-based recovery in this
            build: if you lose both, the account cannot be restored by anyone. You are responsible
            for activity under your account.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">6. Sharing with a household</h2>
          <p className="mt-2">
            Sharing a record shows its contents to the people you share it with. Sharing a record
            does not transfer the underlying benefit — a gift card that is not transferable stays
            non-transferable regardless of who can see the record. Check the provider&rsquo;s own
            terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">7. Acceptable use</h2>
          <p className="mt-2">
            Do not use ValueBack to store credentials or codes you are not entitled to, to attempt
            to access another person&rsquo;s records, or to break the law of the place you are in.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">8. Plans and payment</h2>
          <p className="mt-2">
            No payment provider is connected in this build and nothing can be purchased. Prices
            shown on the pricing page are provisional. If paid plans are introduced, billing terms
            will be written and presented before any charge can occur.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">
            9. Availability and liability
          </h2>
          <p className="mt-2">
            The software is provided as is, without warranty. It is an early build that has not had
            an independent security assessment. To the fullest extent the law allows, the author is
            not liable for a benefit that expires, a refund that is not received, or a loss arising
            from reliance on information stored here. Nothing in these terms limits a liability that
            cannot be limited by law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">10. Ending use</h2>
          <p className="mt-2">
            You can delete your account at any time from Settings, which permanently removes your
            records and uploaded files. Export anything you want to keep first.
          </p>
        </section>
      </div>
    </div>
  );
}
