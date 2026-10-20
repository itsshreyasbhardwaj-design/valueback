import type { Metadata } from 'next';
import { Alert } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'How ValueBack handles your data in this build.',
};

const UPDATED = '20 October 2026';

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold">Privacy policy</h1>
      <p className="mt-2 text-sm text-[var(--text-faint)]">Draft · last updated {UPDATED}</p>

      <Alert tone="warning" title="This is an initial draft" className="mt-5">
        It describes what the software actually does today. It has not been reviewed by a lawyer and
        is not a substitute for one. Before any public launch it needs review against the Digital
        Personal Data Protection Act, 2023 and any other law that applies where the service is
        offered.
      </Alert>

      <div className="mt-8 space-y-6 text-[0.9375rem] leading-relaxed text-[var(--text-muted)]">
        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">Who runs this</h2>
          <p className="mt-2">
            This build of ValueBack runs on infrastructure controlled by whoever installed it — in
            the normal case, you, on your own machine. There is no hosted ValueBack service, no
            company behind it, and no central database. Statements below describe the software, not
            a provider.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">What is stored</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              Your email address, your display name and a hash of your password (never the
              password).
            </li>
            <li>
              The records you create: benefits, refund cases, balance history, notes, tags and
              conditions.
            </li>
            <li>Files you upload, and the text extracted from them.</li>
            <li>Redemption codes you choose to store, encrypted with AES-256-GCM.</li>
            <li>Session records, reminders, notifications and your settings.</li>
            <li>
              An audit log of actions such as &ldquo;benefit created&rdquo;, deliberately stripped
              of amounts, codes and free text.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">What is not collected</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>No analytics, telemetry, crash reporting or advertising identifiers.</li>
            <li>
              No third-party scripts, fonts or trackers — the pages load nothing from another
              domain.
            </li>
            <li>
              No bank, card or merchant credentials, because nothing connects to those systems.
            </li>
            <li>No location data, contacts or device identifiers.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">Where your data goes</h2>
          <p className="mt-2">
            Nowhere. Document text extraction and image recognition run locally on the machine
            hosting the app. The only outbound network request the project makes is a one-time,
            optional download of an open-source text-recognition model, triggered by an explicit
            command. Your documents and records are not part of that request.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">Sharing with other people</h2>
          <p className="mt-2">
            Nothing is shared with another account unless you create a household and then share a
            specific record with it. Household membership alone grants no visibility. You can revoke
            a share or remove a member at any time, and access stops on their next request.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">Keeping and deleting data</h2>
          <p className="mt-2">
            Records are kept until you delete them. Deleting a document removes both the database
            row and the file. Deleting your account permanently removes your records, documents,
            sessions and settings — it is not a soft delete and it cannot be undone. Export your
            data first if you want a copy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">Your choices</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              Export everything at any time as CSV, JSON or a .tar.gz archive including your files.
            </li>
            <li>Turn off indexing of document text for search in Settings.</li>
            <li>Turn in-app and browser notifications on or off.</li>
            <li>Delete individual documents, individual records, or the whole account.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">Security, honestly stated</h2>
          <p className="mt-2">
            Passwords are hashed with scrypt, sessions are server-side with HTTP-only cookies,
            access is checked on the server for every record, uploads are validated by content, and
            redemption codes are encrypted. None of that makes software impossible to attack. This
            build has not had an independent security assessment, and the project documentation
            lists its known residual risks rather than claiming there are none.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text)]">Changes</h2>
          <p className="mt-2">
            If this draft changes, the date at the top changes with it. A deployed service would
            need a real notification mechanism here; this build has none.
          </p>
        </section>
      </div>
    </div>
  );
}
