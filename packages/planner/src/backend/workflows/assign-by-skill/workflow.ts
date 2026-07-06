import type { ApprovalCard } from '@seta/agent-sdk';
import type { SessionScope } from '@seta/core';
import type { CandidateUser } from './schemas.ts';
import {
  type CandidatePoolDeps,
  candidatePool,
  type PoolCandidate,
} from './steps/candidate-pool.ts';
import { enrichWithLoadAndCapacity } from './steps/enrich-with-load-capacity.ts';
import { type LoadedTask, loadTask } from './steps/load-task.ts';
import { modalTimezone, type RankWeights, rankCandidates } from './steps/rank-candidates.ts';
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
  /** Per-tenant scoring weights; defaults match agent.tenant_settings DEFAULT_TENANT_SETTINGS. */
  weights?: RankWeights;
}

export interface RunSuggestAssigneeInput {
  taskId: string;
  session: {
    tenantId: string;
    userId: string;
    roleSummary: { roles: string[]; cross_tenant_read: boolean };
  };
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
export async function computeAssigneeSuggestions(
  input: Pick<RunSuggestAssigneeInput, 'taskId' | 'session'>,
  deps: AssignBySkillDeps,
): Promise<{ task: LoadedTask; candidates: CandidateUser[] }> {
  const tenantId = input.session.tenantId;
  const callerUserId = input.session.userId;
  const callerRoleSummary = input.session.roleSummary;

  const task = await loadTask({ tenantId, taskId: input.taskId });
  const pool = await candidatePool({ tenantId, callerUserId, callerRoleSummary, task }, deps);

  const preRanked = preRank(pool, task.labels.length).slice(0, PRE_RANK_TOP_K);
  const enriched =
    preRanked.length === 0
      ? []
      : await enrichWithLoadAndCapacity({
          tenantId,
          callerUserId,
          callerRoleSummary,
          candidates: preRanked,
        });

  const referenceTz = modalTimezone(enriched);

  const candidates = rankCandidates({
    candidates: enriched,
    weights: deps.weights ?? DEFAULT_ASSIGN_WEIGHTS,
    task: {
      dueAt: task.due_at,
      referenceTz,
      priority: task.priority_number,
      labelCount: task.labels.length,
    },
    topK: FINAL_TOP_K,
  });

  return { task, candidates };
}

export async function runSuggestAssignee(
  input: RunSuggestAssigneeInput,
  deps: AssignBySkillDeps,
): Promise<SuggestAssigneeOutput> {
  const { task, candidates } = await computeAssigneeSuggestions(
    { taskId: input.taskId, session: input.session },
    deps,
  );
  const card = buildSuggestAssigneeCard({
    taskId: task.taskId,
    taskTitle: task.title,
    candidates,
    session: { tenantId: input.session.tenantId, userId: input.session.userId },
    toolCallId: input.toolCallId,
  });
  return { task, candidates, card };
}

function preRank(pool: PoolCandidate[], labelCount: number): PoolCandidate[] {
  const denom = Math.min(Math.max(labelCount, 1), 3);
  return pool
    .map((c) => ({
      c,
      s:
        Math.min(1, c.exactOverlap / denom) * 0.5 +
        Math.max(c.vectorScore ?? 0, c.historyScore ?? 0) * 0.5,
    }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}

/**
 * Helper for the planner_suggestAssignee tool's resume path: turn the user's
 * decision into a structured output for `withEmit` audit / metrics.
 */
export type AssignDecisionInput =
  | { action: 'assign'; assigneeUserIds: string[] }
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
  | { kind: 'assigned'; taskId: string; userIds: string[] }
  | { kind: 'left-unassigned'; taskId: string }
  | { kind: 'declined' }
> {
  if (input.decision.action === 'decline') return { kind: 'declined' };
  if (input.decision.action === 'leave-unassigned') {
    return { kind: 'left-unassigned', taskId: input.taskId };
  }
  // Sequential to keep per-row audit ordering deterministic — assignTask emits
  // one planner.task.assigned event per call.
  for (const userId of input.decision.assigneeUserIds) {
    await deps.assignTask({
      task_id: input.taskId,
      user_id: userId,
      session: input.session,
    });
  }
  return {
    kind: 'assigned',
    taskId: input.taskId,
    userIds: input.decision.assigneeUserIds,
  };
}
