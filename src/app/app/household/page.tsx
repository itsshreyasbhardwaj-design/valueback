import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { Users } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { householdsOf, invitesFor, membersOf, sharedWithMe, MAX_MEMBERS } from '@/lib/household';
import { PLAN_LIMITS } from '@/lib/entitlements';
import { todayIso } from '@/lib/dates';
import { timestamp } from '@/lib/format';
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { BenefitRow, RefundRow } from '@/components/records';
import {
  AcceptInvitePanel,
  CreateHouseholdPanel,
  DeleteHouseholdPanel,
  InvitePanel,
  LeaveHouseholdButton,
  RemoveMemberButton,
  RevokeInviteButton,
} from './panels';

export const metadata: Metadata = { title: 'Household' };

export default async function HouseholdPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const invitePrefill = typeof sp.invite === 'string' ? sp.invite : undefined;
  const prefs = { currency: user.settings.currency, dateFormat: user.settings.dateFormat };
  const today = todayIso(user.settings.timeZone);

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const baseUrl = `${proto}://${host}`;

  const mine = householdsOf(user.id);
  const shared = sharedWithMe(user.id);
  const canCreate = mine.filter((m) => m.role === 'owner').length < PLAN_LIMITS[user.plan].households;

  return (
    <>
      <PageHeader
        title="FamilyValue"
        description="Share selected records with the people you actually share money with. Joining a household shows them nothing by itself."
      />

      <Alert tone="neutral" title="How sharing works here" className="mb-5">
        Membership grants no visibility at all. Each benefit or refund case has its own “Sharing” panel,
        and only the owner of a record can share it or stop sharing it. A viewer can never edit, whatever
        a share says.
      </Alert>

      {invitePrefill ? (
        <Alert tone="info" title="You have an invitation link" className="mb-5">
          Check the household name below before joining.
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {mine.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Users size={26} aria-hidden />}
                title="You are not in a household"
                description="Create one to share a record with a partner, a parent or a flatmate, or join one with an invitation code."
              />
            </Card>
          ) : null}

          {mine.map(({ household, role }) => {
            const members = membersOf(household.id);
            const invites = role === 'owner' ? invitesFor(household.id) : [];
            return (
              <Card key={household.id}>
                <CardHeader
                  title={household.name}
                  description={`${members.length} of ${MAX_MEMBERS[user.plan]} members · you are the ${role}`}
                  action={<Badge tone={role === 'owner' ? 'positive' : 'neutral'}>{role}</Badge>}
                />

                <ul className="divide-y divide-[var(--border)]">
                  {members.map((m) => (
                    <li key={m.userId} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {m.name || m.email}
                          {m.userId === user.id ? ' (you)' : ''}
                        </p>
                        <p className="truncate text-xs text-[var(--text-faint)]">
                          {m.email} · joined {timestamp(m.joinedAt, prefs)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={m.role === 'owner' ? 'positive' : m.role === 'viewer' ? 'neutral' : 'info'}>{m.role}</Badge>
                        {role === 'owner' && m.userId !== user.id ? (
                          <RemoveMemberButton householdId={household.id} memberUserId={m.userId} />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>

                {role === 'owner' ? (
                  <>
                    <div className="border-t border-[var(--border)]">
                      <InvitePanel householdId={household.id} baseUrl={baseUrl} />
                    </div>
                    {invites.length > 0 ? (
                      <div className="border-t border-[var(--border)] px-4 py-3 sm:px-5">
                        <p className="text-sm font-semibold">Open invitations</p>
                        <ul className="mt-2 space-y-1.5">
                          {invites.map((i) => (
                            <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                              <span className="text-[var(--text-muted)]">
                                {i.role} · expires {timestamp(i.expiresAt, prefs)}
                              </span>
                              <RevokeInviteButton inviteId={i.id} />
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-xs text-[var(--text-faint)]">
                          The code itself is not stored and cannot be shown again. Revoke and create a new
                          one if it was lost.
                        </p>
                      </div>
                    ) : null}
                    <div className="border-t border-[var(--border)] p-4">
                      <DeleteHouseholdPanel householdId={household.id} />
                    </div>
                  </>
                ) : (
                  <div className="border-t border-[var(--border)] p-4">
                    <LeaveHouseholdButton householdId={household.id} />
                  </div>
                )}
              </Card>
            );
          })}

          {shared.benefits.length > 0 || shared.refunds.length > 0 ? (
            <Card>
              <CardHeader
                title="Shared with you"
                description="Records other members chose to share. You see nothing else they own."
              />
              <ul className="divide-y divide-[var(--border)]">
                {shared.benefits.map((s) => (
                  <BenefitRow
                    key={s.benefit.id}
                    benefit={s.benefit}
                    today={today}
                    prefs={prefs}
                    shared={{ householdName: s.household.name, permission: s.permission }}
                  />
                ))}
                {shared.refunds.map((s) => (
                  <RefundRow
                    key={s.refundCase.id}
                    refundCase={s.refundCase}
                    today={today}
                    prefs={prefs}
                    shared={{ householdName: s.household.name }}
                  />
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          {canCreate ? (
            <Card>
              <CardHeader
                title="Create a household"
                description={`Your plan includes ${PLAN_LIMITS[user.plan].households} household ${
                  PLAN_LIMITS[user.plan].households === 1 ? 'space' : 'spaces'
                }.`}
              />
              <CreateHouseholdPanel />
            </Card>
          ) : (
            <Card className="p-4">
              <p className="text-sm font-semibold">Household limit reached</p>
              <p className="mt-1.5 text-[0.8125rem] text-[var(--text-muted)]">
                Your plan includes {PLAN_LIMITS[user.plan].households}. Leave or delete one to create
                another.{' '}
                <Link href="/pricing" className="underline">
                  See plans
                </Link>
              </p>
            </Card>
          )}

          <Card>
            <CardHeader title="Join with a code" description="Someone sends you the code; you paste it here." />
            <AcceptInvitePanel prefill={invitePrefill} />
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold">What the roles mean</h2>
            <dl className="mt-2 space-y-2 text-[0.8125rem] text-[var(--text-muted)]">
              <div>
                <dt className="font-medium text-[var(--text)]">Owner</dt>
                <dd>Invites and removes people, deletes the household. One per household.</dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--text)]">Member</dt>
                <dd>Can act on records shared with edit permission — recording a usage, moving a refund on.</dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--text)]">Viewer</dt>
                <dd>Read-only on anything shared, even if the share says edit.</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold">Sharing is not transfer</h2>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--text-muted)]">
              Letting someone see a gift card record does not make the card theirs to use. Many providers
              say cards are non-transferable; check their terms before relying on it.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
