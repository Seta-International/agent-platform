import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { listAccounts } from '@seta/pm';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  CycleRelockInput,
  CycleUnlockEntry,
  CycleUnlockInput,
  CycleUnlockPanel,
} from '../../contracts.ts';
import { UNLOCK_MAX_DAYS } from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import { performanceCycleUnlock } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { latestClosedCycleMonth, monthClockNow } from './month-clock.ts';

const DAY_MS = 86_400_000;

type UnlockRow = typeof performanceCycleUnlock.$inferSelect;

function toEntry(row: UnlockRow): CycleUnlockEntry {
  return {
    id: row.id,
    review_month: row.review_month,
    account_id: row.account_id,
    action: row.action,
    expires_at: row.expires_at?.toISOString() ?? null,
    actor_person_id: row.actor_person_id,
    actor_user_id: row.actor_user_id,
    created_at: row.created_at.toISOString(),
  };
}

/** The latest row for an account/month is its current state; expiry is read-time. */
function unlockedUntil(row: UnlockRow | undefined, at: Date): Date | null {
  if (row?.action !== 'unlock' || !row.expires_at) return null;
  return row.expires_at.getTime() > at.getTime() ? row.expires_at : null;
}

/**
 * Which of `accountIds` are currently unlocked for this review month (FUT-781)? An
 * account counts only while its latest action is an `unlock` whose deadline has not
 * passed — windows close by themselves, with no scheduled job. Always tenant-filtered
 * (defense-in-depth alongside RLS).
 */
export async function unlockedAccountIds(
  session: SessionScope,
  month: string,
  accountIds: readonly string[],
): Promise<Set<string>> {
  const wanted = new Set(accountIds.filter(Boolean));
  if (wanted.size === 0) return new Set();

  const rows = await peopleDb()
    .select()
    .from(performanceCycleUnlock)
    .where(
      and(
        eq(performanceCycleUnlock.tenant_id, session.tenant_id),
        eq(performanceCycleUnlock.review_month, month),
        inArray(performanceCycleUnlock.account_id, [...wanted]),
      ),
    )
    .orderBy(desc(performanceCycleUnlock.seq));

  const at = monthClockNow();
  const seen = new Set<string>();
  const open = new Set<string>();
  // Newest-first, so the first row seen per account is its current state.
  for (const r of rows) {
    if (seen.has(r.account_id)) continue;
    seen.add(r.account_id);
    if (unlockedUntil(r, at)) open.add(r.account_id);
  }
  return open;
}

/** Is a manual unlock in effect for this one account's review month? */
export async function resolveOverrideActive(
  session: SessionScope,
  input: { month: string; account_id?: string | null },
): Promise<boolean> {
  if (!input.account_id) return false;
  const open = await unlockedAccountIds(session, input.month, [input.account_id]);
  return open.has(input.account_id);
}

/**
 * The month PMO may reopen right now. Only the latest closed cycle qualifies: an
 * older month has been signed off and stays view-only, and a month whose window has
 * not opened yet is not "locked" in the sense a manual unlock is meant to fix.
 */
function assertUnlockableMonth(month: string, at: Date): void {
  const unlockable = latestClosedCycleMonth(at);
  if (month !== unlockable) {
    throw new PeopleError(
      'VALIDATION',
      `month: only the latest closed cycle (${unlockable}) can be unlocked`,
      { requested: month, unlockable_month: unlockable },
    );
  }
}

async function appendAction(
  session: SessionScope,
  input: {
    month: string;
    account_id: string;
    action: 'unlock' | 'relock';
    days?: number;
  },
): Promise<CycleUnlockEntry> {
  requirePermission(session, 'people.performance.unlock');
  const at = monthClockNow();
  assertUnlockableMonth(input.month, at);

  if (input.action === 'unlock') {
    const days = input.days;
    if (!Number.isInteger(days) || days === undefined || days < 1 || days > UNLOCK_MAX_DAYS) {
      throw new PeopleError('VALIDATION', `days: expected an integer 1–${UNLOCK_MAX_DAYS}`);
    }
  }
  const expiresAt =
    input.action === 'unlock' ? new Date(at.getTime() + (input.days as number) * DAY_MS) : null;

  let entry: CycleUnlockEntry | undefined;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      // Serialize concurrent actions on this account/month so two tabs can't both act
      // on the same stale state.
      const lockKey = `perf-unlock:${session.tenant_id}:${input.month}:${input.account_id}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0))`);

      const [latest] = await tx
        .select()
        .from(performanceCycleUnlock)
        .where(
          and(
            eq(performanceCycleUnlock.tenant_id, session.tenant_id),
            eq(performanceCycleUnlock.review_month, input.month),
            eq(performanceCycleUnlock.account_id, input.account_id),
          ),
        )
        .orderBy(desc(performanceCycleUnlock.seq))
        .limit(1);

      const openUntil = unlockedUntil(latest as UnlockRow | undefined, at);
      if (input.action === 'unlock' && openUntil) {
        throw new PeopleError(
          'CONFLICT',
          'This account is already unlocked — reload before trying again.',
          { unlocked_until: openUntil.toISOString() },
        );
      }
      if (input.action === 'relock' && !openUntil) {
        throw new PeopleError(
          'CONFLICT',
          'This account is already locked — reload before trying again.',
        );
      }

      const [row] = await tx
        .insert(performanceCycleUnlock)
        .values({
          tenant_id: session.tenant_id,
          review_month: input.month,
          account_id: input.account_id,
          action: input.action,
          expires_at: expiresAt,
          actor_person_id: session.person_id,
          actor_user_id: session.user_id,
          created_at: at,
        })
        .returning();

      entry = toEntry(row as UnlockRow);

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'people.performance_cycle',
        aggregateId: `${input.month}:${input.account_id}`,
        eventType:
          input.action === 'unlock'
            ? 'people.performance.cycle.unlocked'
            : 'people.performance.cycle.relocked',
        eventVersion: 1,
        payload: {
          month: input.month,
          account_id: input.account_id,
          expires_at: expiresAt?.toISOString() ?? null,
          actor_user_id: session.user_id,
        },
      });
    },
  );

  // withEmit resolves only after the tx commits; entry is always set on success.
  return entry as CycleUnlockEntry;
}

/** PMO reopens one account's review month for 1–5 days. */
export function unlockCycle(
  session: SessionScope,
  input: CycleUnlockInput,
): Promise<CycleUnlockEntry> {
  return appendAction(session, { ...input, action: 'unlock' });
}

/** PMO closes an account's window ahead of its deadline. */
export function relockCycle(
  session: SessionScope,
  input: CycleRelockInput,
): Promise<CycleUnlockEntry> {
  return appendAction(session, { ...input, action: 'relock' });
}

/**
 * Everything the PMO unlock panel renders (AC4 trail included). Gated on the same
 * permission the panel's buttons need — a caller who could read it but never act
 * would only ever see a workspace that rejects every action.
 */
export async function readCycleUnlockPanel(session: SessionScope): Promise<CycleUnlockPanel> {
  requirePermission(session, 'people.performance.unlock');
  const at = monthClockNow();
  const month = latestClosedCycleMonth(at);

  const rows = await peopleDb()
    .select()
    .from(performanceCycleUnlock)
    .where(
      and(
        eq(performanceCycleUnlock.tenant_id, session.tenant_id),
        eq(performanceCycleUnlock.review_month, month),
      ),
    )
    .orderBy(desc(performanceCycleUnlock.seq));

  // Rows are newest-first, so the first one seen per account is its current state.
  const latestByAccount = new Map<string, UnlockRow>();
  for (const r of rows) {
    if (!latestByAccount.has(r.account_id)) latestByAccount.set(r.account_id, r);
  }

  const accounts = await listAccounts(session);
  return {
    unlockable_month: month,
    max_days: UNLOCK_MAX_DAYS,
    accounts: accounts.map((a) => ({
      account_id: a.account_id,
      name: a.name,
      unlocked_until: unlockedUntil(latestByAccount.get(a.account_id), at)?.toISOString() ?? null,
    })),
    entries: rows.map(toEntry),
  };
}
