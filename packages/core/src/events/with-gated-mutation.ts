import type { NodeTx } from '@seta/shared-db';
import type { ActorContext } from '@seta/shared-types';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { coreEvents, mutationIdempotency } from '../db/schema/index.ts';
import { emitContext } from './context.ts';
import { EmitContextRequired } from './emit.ts';
import { withEmit } from './with-emit.ts';

export type MutationKind =
  | 'create'
  | 'update'
  | 'bulk_update'
  | 'merge_soft_delete'
  | 'link'
  | 'assign'
  | 'comment';

/** Structurally satisfied by SessionScope; declared narrowly so events/ keeps no
 *  dependency on the session module. */
export interface MutationSession {
  user_id: string;
  tenant_id: string;
}

export interface GatedMutationOpts {
  /** Required for every write. Minted once per user intent, NOT derived from the
   *  mutation's content — a content-derived key would wrongly block a user who
   *  deliberately asks for the same change twice. */
  idempotencyKey: string;
  /** The human the assistant is acting for. */
  onBehalfOf: string;
  actorKind?: 'user' | 'agent';
  mutationKind: MutationKind;
  /** Called once before and once after the body. ONE function called twice, so the
   *  two sides of the diff cannot drift in shape. Omit it and before/after stay null. */
  snapshot?: (tx: NodeTx) => Promise<unknown>;
}

export interface GatedMutationResult<R> {
  result: R;
  /** True when the key had already been used and the body was NOT executed. */
  replayed: boolean;
}

/**
 * The single governed write path: idempotency, attribution and before/after capture
 * around one or more domain functions, all in ONE transaction (they join it through
 * reentrant withEmit). Scope checks and validation stay in the domain functions —
 * the gateway never re-implements them, which keeps requirePermission below the model.
 *
 * Protocol, at READ COMMITTED (withEmit passes no isolation option):
 *  1. pg_advisory_xact_lock on (tenant, key) — early mutex, released on commit/abort.
 *  2. Prior row present ⇒ return its result, do NOT execute.
 *  3. snapshot() ⇒ before.
 *  4. body(), then snapshot() again ⇒ after.
 *  5. INSERT ... ON CONFLICT DO NOTHING; zero rows ⇒ re-read and replay (a backstop
 *     for a caller that somehow bypassed the lock; safe under READ COMMITTED).
 *  6. Backfill before/after onto the events the body emitted — the domain functions
 *     already emitted them by the time `after` exists.
 *
 * Why an advisory lock rather than an insert-first claim: a claim would need `result`
 * nullable (a state the design never intends) and would force a "unique violation ⇒
 * transaction aborted ⇒ open a fresh transaction to read the winner" branch, the
 * hardest path to get right. Accepted trade-off: advisory locks share one 64-bit space
 * database-wide, so a hash collision serializes two unrelated mutations — wrong on
 * throughput, never wrong on correctness, and only for one short transaction.
 */
export async function withGatedMutation<R extends Record<string, unknown>>(
  session: MutationSession,
  opts: GatedMutationOpts,
  body: (tx: NodeTx) => Promise<R>,
): Promise<GatedMutationResult<R>> {
  const actor: ActorContext = {
    userId: session.user_id,
    tenantId: session.tenant_id,
    actorKind: opts.actorKind ?? 'agent',
    onBehalfOf: opts.onBehalfOf,
  };

  return withEmit({ actor }, async (tx) => {
    const ctx = emitContext.getStore();
    if (!ctx) throw new EmitContextRequired();

    const lockKey = `${session.tenant_id}:${opts.idempotencyKey}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0))`);

    const readPrior = async () =>
      tx
        .select()
        .from(mutationIdempotency)
        .where(
          and(
            eq(mutationIdempotency.tenant_id, session.tenant_id),
            eq(mutationIdempotency.key, opts.idempotencyKey),
          ),
        )
        .limit(1);

    const [prior] = await readPrior();
    if (prior) return { result: prior.result as R, replayed: true };

    const before = opts.snapshot ? await opts.snapshot(tx) : undefined;

    const emitted: string[] = [];
    ctx.emittedEventIds = emitted;
    const result = await body(tx);
    const after = opts.snapshot ? await opts.snapshot(tx) : undefined;

    const inserted = await tx
      .insert(mutationIdempotency)
      .values({
        tenant_id: session.tenant_id,
        key: opts.idempotencyKey,
        mutation_kind: opts.mutationKind,
        result,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) {
      const [winner] = await readPrior();
      if (!winner) {
        throw new Error(
          `withGatedMutation: key ${opts.idempotencyKey} conflicted on insert but is unreadable — ` +
            'the RLS policy and the primary key disagree.',
        );
      }
      return { result: winner.result as R, replayed: true };
    }

    if (opts.snapshot && emitted.length > 0) {
      await tx
        .update(coreEvents)
        .set({ before: before as never, after: after as never })
        .where(inArray(coreEvents.id, emitted));
    }
    ctx.emittedEventIds = undefined;

    return { result, replayed: false };
  });
}
