// packages/planner/tests/fixtures/golden/action/run-case.ts
//
// Runs ONE A2 conversation case and returns a TurnResult per turn.
//
// Three things this file exists to get right:
//
//  1. A revise turn is an ordinary user turn that happens to arrive while a card
//     is open. Its `openPreview` is rebuilt from the card the previous turn
//     suspended with, through the SAME `taskIdsFromArgsPatch` the production
//     adapter uses (apps/server/src/action-preview-port.ts) — so a case turn and
//     a production turn hand the model the same block.
//  2. `decision: decline` does NOT resume. Not resuming IS the cancel, which is
//     why "cancel writes nothing" needs no mechanism.
//  3. Every turn is measured by diffing the tenant's rows across it, so
//     `dbEffects: none` is an observation and never a promise.
import type { Pool } from 'pg';
import { taskIdsFromArgsPatch } from '../../../../src/backend/orchestration/action/revision.ts';
import type { PlannerActionEvalTarget } from '../../../../src/backend/orchestration/eval-target.ts';
import type { TurnResult } from '../ctx-from-case.ts';
import type { ConversationRunOutput } from '../golden-eval-runner.ts';
import type { ExpectedDbEffects } from '../policy/scorers.ts';
import type { Trajectory } from '../policy/trajectory.ts';
import type { GoldenCase } from '../schema.ts';
import type { RecordedCall } from '../trajectory-collector.ts';
import { checkAfter, diffActionRows, type RowSnapshot, snapshotActionRows } from './db-snapshot.ts';
import { ActionPreviewStore } from './preview-store.ts';
import { drainActionTurn } from './stream-turn.ts';
import { type ActionWorld, resetActionWorld } from './world.ts';

/** The agent every A2 tool call is attributed to (`action/orchestrator.ts:40`).
 *  A2 is a single specialist, so a trajectory has exactly one tier — unlike A1's
 *  orchestrator + sub-agent pair, whose `agentId` distinguishes the two. */
const AGENT_ID = 'planner.action';

/** `drainActionTurn` records calls without an `agentId` (a stream chunk carries no
 *  agent), so the trajectory the scorers read gets it attached here. */
function toTrajectory(calls: RecordedCall[]): Trajectory {
  return { toolCalls: calls.map((c) => ({ agentId: AGENT_ID, ...c })) };
}

/** The ids a fixture builder created, addressable from a case as `fixtures.<name>`. */
export interface FixtureIds {
  [name: string]: string;
}

export interface ActionCaseRunnerDeps {
  pool: Pool;
  world: ActionWorld;
  /** Built per case, so each case's suspend snapshots live in their own store and
   *  no `runId` can collide across cases. */
  buildTarget: (previews: ActionPreviewStore) => PlannerActionEvalTarget;
  /** Runs the builders a case names and returns the ids they created. */
  runFixtures: (names: string[]) => Promise<FixtureIds>;
}

interface OpenCard {
  approvalId: string;
  card: {
    intent: string;
    details?: { kind: string; rows?: { k: string; v: string }[] }[];
    primary: { argsPatch?: Record<string, unknown>; label?: string };
    alternates?: { argsPatch: Record<string, unknown> }[];
    meta: { toolId: string; dedupKeys?: string[] };
  };
  mastraRunId: string;
  toolCallId?: string;
}

/** The `kvTable` rows the card renders — already human: names resolved, priority as
 *  WORDS, dates formatted. Reused verbatim exactly as the production adapter does,
 *  so no second formatter can disagree with what the user is looking at. */
function proposedRows(card: OpenCard['card']): { k: string; v: string }[] {
  for (const block of card.details ?? []) {
    if (block.kind === 'kvTable') return block.rows ?? [];
  }
  return [];
}

function openPreviewFrom(open: OpenCard) {
  return {
    approvalId: open.approvalId,
    toolId: open.card.meta.toolId,
    intent: open.card.intent,
    taskIds: taskIdsFromArgsPatch(open.card.primary.argsPatch ?? {}),
    proposedRows: proposedRows(open.card),
  };
}

/** Replaces every `fixtures.<name>` reference with the id the builder returned.
 *  Exported through `resolveFixtureRefs` because both the row expectations and the
 *  arg predicates need it, and a second copy would drift. */
function resolveIds(value: unknown, ids: FixtureIds): unknown {
  if (typeof value === 'string' && value.startsWith('fixtures.')) {
    const key = value.slice('fixtures.'.length);
    const found = ids[key];
    if (!found) throw new Error(`run-case: unknown fixture id reference "${value}"`);
    return found;
  }
  if (Array.isArray(value)) return value.map((v) => resolveIds(v, ids));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, resolveIds(v, ids)]),
    );
  }
  return value;
}

/** The public face of `resolveIds`: type-preserving, so a caller gets its own shape
 *  back rather than `unknown`. */
export function resolveFixtureRefs<T>(value: T, ids: FixtureIds): T {
  return resolveIds(value, ids) as T;
}

/** Diff the two snapshots, and check the declared columns when there are any. */
function observe(
  before: RowSnapshot,
  after: RowSnapshot,
  expected: ExpectedDbEffects | undefined,
  ids: FixtureIds,
): TurnResult['dbEffects'] {
  const diff = diffActionRows(before, after);
  const rows =
    expected && expected !== 'none' && expected.after.length
      ? (resolveIds(expected.after, ids) as { table: string; id: string }[])
      : [];
  return {
    expected,
    observed: { ...diff, mismatches: rows.length ? checkAfter(after, rows) : [] },
  };
}

export function makeActionCaseRunner(deps: ActionCaseRunnerDeps) {
  return async function runActionCase(c: GoldenCase): Promise<ConversationRunOutput> {
    if (c.kind !== 'conversation') throw new Error(`runActionCase: ${c.id} is not a conversation`);

    // Design D2: fresh task rows per case, actors and plans kept.
    await resetActionWorld(deps.pool, deps.world);
    const previews = new ActionPreviewStore();
    const ids = await deps.runFixtures(c.fixtures);
    const target = deps.buildTarget(previews);

    // Fixture ids are minted per case, so the case's own references have to be
    // resolved BEFORE any scorer reads them. Done once, on a clone, so the loaded
    // case object stays pristine for the next run.
    const resolvedCase = resolveFixtureRefs(structuredClone(c), ids);
    if (resolvedCase.kind !== 'conversation') {
      throw new Error(`runActionCase: ${c.id} is not a conversation`);
    }

    // `actor.userId` in a case is a ROLE name, not a uuid: the world's ids are
    // minted at seed time and a case file cannot know them.
    const asViewer = c.actor.userId === 'viewer';
    const actor = {
      tenantId: deps.world.tenantId,
      actorUserId: asViewer ? deps.world.viewerUserId : deps.world.memberUserId,
      effectivePermissions: asViewer
        ? deps.world.permissions.viewer
        : deps.world.permissions.member,
    };

    const results: TurnResult[] = [];
    let open: OpenCard | null = null;

    // A case that breaks mid-conversation returns what it has instead of throwing:
    // the turn that went wrong is only diagnosable from the turns before it.
    try {
      for (const turn of resolvedCase.turns) {
        const before = await snapshotActionRows(deps.pool, deps.world);
        const expected = turn.expected.dbEffects;

        if ('user' in turn) {
          const outcome = await drainActionTurn(
            await target.runStream(
              {
                userText: turn.user,
                taskId: null,
                openPreview: open ? openPreviewFrom(open) : null,
              },
              actor as never,
            ),
          );

          if (outcome.suspended && outcome.card) {
            const card = outcome.card as unknown as OpenCard['card'];
            // Supersede only when the new card names the SAME tool as the open one —
            // the comparison the server makes (`open.toolId !== toolId`). A different
            // tool leaves both cards pending, which is what design D4 requires.
            const approvalId: string =
              open && open.card.meta.toolId === card.meta.toolId
                ? previews.supersede(open.approvalId, card)
                : previews.open(card);
            open = {
              approvalId,
              card,
              mastraRunId: outcome.mastraRunId!,
              toolCallId: outcome.toolCallId,
            };
          }

          results.push({
            answer: outcome.answer,
            trajectory: toTrajectory(outcome.toolCalls),
            signals: { suspended: outcome.suspended },
            dbEffects: observe(
              before,
              await snapshotActionRows(deps.pool, deps.world),
              expected,
              ids,
            ),
          });
          continue;
        }

        // A decision turn with nothing to decide is the AGENT's failure, not the
        // harness's: no earlier turn opened a card, which is A2's known revision
        // bug (revision.yaml:222-228). Throwing here marked every metric the case
        // claimed `error`, and an errored case is excluded from the rates — so the
        // most interesting failure in the corpus reported nothing at all.
        // Record the turn as it happened: nothing ran, nothing changed.
        if (!open) {
          results.push({
            answer: '',
            trajectory: { toolCalls: [] },
            signals: { noPreview: true },
            dbEffects: observe(
              before,
              await snapshotActionRows(deps.pool, deps.world),
              expected,
              ids,
            ),
          });
          continue;
        }

        if (turn.decision.chosen === 'decline') {
          previews.decide(open.approvalId);
          open = null;
          results.push({
            answer: '',
            trajectory: { toolCalls: [] },
            signals: { declined: true },
            dbEffects: observe(
              before,
              await snapshotActionRows(deps.pool, deps.world),
              expected,
              ids,
            ),
          });
          continue;
        }

        const patch =
          turn.decision.chosen === 'primary'
            ? open.card.primary.argsPatch
            : open.card.alternates?.[turn.decision.alternateIndex ?? 0]?.argsPatch;
        if (!patch)
          throw new Error(`runActionCase: ${c.id} has no argsPatch for the chosen action`);

        const resumed = await drainActionTurn(
          await target.runResume(
            patch as never,
            {
              ...actor,
              mastraRunId: open.mastraRunId,
              toolCallId: open.toolCallId,
            } as never,
          ),
        );
        previews.decide(open.approvalId);
        open = null;

        results.push({
          answer: resumed.answer,
          trajectory: toTrajectory(resumed.toolCalls),
          signals: { applied: true },
          dbEffects: observe(
            before,
            await snapshotActionRows(deps.pool, deps.world),
            expected,
            ids,
          ),
        });
      }
    } catch (err) {
      return {
        turns: results,
        resolvedCase,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    return { turns: results, resolvedCase };
  };
}
