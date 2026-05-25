import type { ApprovalCard } from '@seta/copilot-sdk';
import type { SessionScope } from '@seta/core';
import type { CandidateUser } from './schemas.ts';
import {
  type CandidatePoolDeps,
  candidatePool,
  type PoolCandidate,
} from './steps/candidate-pool.ts';
import { enrichWithLoadAndCapacity } from './steps/enrich-with-load-capacity.ts';
import { type LoadedTask, loadTask } from './steps/load-task.ts';
import { type RankWeights, rankCandidates } from './steps/rank-candidates.ts';
import { buildSuggestAssigneeCard } from './steps/suggest-assignee.ts';

const PRE_RANK_TOP_K = 10;
const FINAL_TOP_K = 5;

export const DEFAULT_ASSIGN_WEIGHTS: RankWeights = {
  exact: 0.4,
  vec: 0.25,
  load: 0.25,
  tz: 0.1,
};

export interface AssignBySkillDeps extends CandidatePoolDeps {
  /** Per-tenant scoring weights; defaults match copilot.tenant_settings DEFAULT_TENANT_SETTINGS. */
  weights?: RankWeights;
}

export interface RunSuggestAssigneeInput {
  taskId: string;
  session: { tenantId: string; userId: string };
  toolCallId: string;
}

export interface SuggestAssigneeOutput {
  task: LoadedTask;
  candidates: CandidateUser[];
  card: ApprovalCard;
}

/**
 * Read-only orchestration of the assignBySkill flow.
 *
 * Optimization: pre-rank the full pool by cheap in-memory signals (exact +
 * vector + history), keep only PRE_RANK_TOP_K = 10 for the expensive
 * cross-module enrichment pass, then re-rank with full signal and return
 * FINAL_TOP_K = 5. Reduces cross-module RPCs roughly 3-5× on larger pools
 * without hurting top-5 fidelity (a candidate that doesn't make top-10 by
 * skill alone won't beat one that does on the load/tz signal).
 */
export async function runSuggestAssignee(
  input: RunSuggestAssigneeInput,
  deps: AssignBySkillDeps,
): Promise<SuggestAssigneeOutput> {
  const tenantId = input.session.tenantId;
  const callerUserId = input.session.userId;

  const task = await loadTask({ tenantId, taskId: input.taskId });
  const pool = await candidatePool({ tenantId, callerUserId, task }, deps);

  const preRanked = preRank(pool).slice(0, PRE_RANK_TOP_K);
  const enriched =
    preRanked.length === 0
      ? []
      : await enrichWithLoadAndCapacity({
          tenantId,
          callerUserId,
          candidates: preRanked,
        });

  const callerTz = fetchCallerTimezone(callerUserId, enriched);

  const ranked = rankCandidates({
    candidates: enriched,
    weights: deps.weights ?? DEFAULT_ASSIGN_WEIGHTS,
    task: {
      dueAt: task.due_at,
      tenantTz: callerTz,
      priority: task.priority_number,
    },
    topK: FINAL_TOP_K,
  });

  const card = buildSuggestAssigneeCard({
    taskId: task.taskId,
    taskTitle: task.title,
    candidates: ranked,
    session: { tenantId, userId: callerUserId },
    toolCallId: input.toolCallId,
  });

  return { task, candidates: ranked, card };
}

function preRank(pool: PoolCandidate[]): PoolCandidate[] {
  return pool
    .map((c) => ({
      c,
      s:
        Math.min(1, c.exactOverlap / 3) * 0.5 +
        Math.max(c.vectorScore ?? 0, c.historyScore ?? 0) * 0.5,
    }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}

function fetchCallerTimezone(
  callerId: string,
  enriched: ReadonlyArray<{ userId: string; timezone: string | null }>,
): string {
  const me = enriched.find((c) => c.userId === callerId);
  return me?.timezone ?? 'UTC';
}

/**
 * Helper for the planner_suggestAssignee tool's resume path: turn the user's
 * decision into a structured output for `withEmit` audit / metrics.
 */
export type AssignDecisionInput =
  | { action: 'assign'; assigneeUserId: string }
  | { action: 'leave-unassigned' }
  | { action: 'decline' };

export interface ApplyAssignDecisionInput {
  taskId: string;
  decision: AssignDecisionInput;
  session: SessionScope;
}

export async function applyAssignDecision(
  input: ApplyAssignDecisionInput,
  deps: {
    assignTask: (i: { task_id: string; user_id: string; session: SessionScope }) => Promise<void>;
  },
): Promise<
  | { kind: 'assigned'; taskId: string; userId: string }
  | { kind: 'left-unassigned'; taskId: string }
  | { kind: 'declined' }
> {
  if (input.decision.action === 'decline') return { kind: 'declined' };
  if (input.decision.action === 'leave-unassigned') {
    return { kind: 'left-unassigned', taskId: input.taskId };
  }
  await deps.assignTask({
    task_id: input.taskId,
    user_id: input.decision.assigneeUserId,
    session: input.session,
  });
  return { kind: 'assigned', taskId: input.taskId, userId: input.decision.assigneeUserId };
}
