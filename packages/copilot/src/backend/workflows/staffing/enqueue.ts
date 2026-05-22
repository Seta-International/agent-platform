import { randomUUID } from 'node:crypto';
import type { TaskSkillItem } from '../../tools/analyzer/planner.build-task-skill-queue.ts';
import type { UserAvailabilityResult } from '../../tools/avai-checker/build-availability-queue.ts';
import type { RankedCandidate } from '../../tools/skill-matcher/rank-candidates.ts';
import {
  type AvaiCheckerDispatchPayload,
  JOB_NAMES,
  type RecommendDispatchPayload,
  type SkillMatcherDispatchPayload,
} from './types.ts';

// ──────────────────────────────────────────────────────────────────────────────
// Shared types
// ──────────────────────────────────────────────────────────────────────────────

type AddJob = (identifier: string, payload?: unknown) => Promise<void>;
type EnqueueResult = { job_id: string; queue: string; enqueued_at: string };

// ──────────────────────────────────────────────────────────────────────────────
// TaskAnalyzer → Staffing workflow
//
// Inject as `enqueueForOrchestrator` in makePlannerBuildTaskSkillQueueTool.
//
// The tool sends a batch of TaskSkillItems (one per task).
// This factory fans out — creates one staffing:skill_matcher_dispatch job per item.
// ──────────────────────────────────────────────────────────────────────────────

export function makeTaskAnalyzerEnqueue(deps: { addJob: AddJob }) {
  return async (params: {
    payload: TaskSkillItem[];
    enqueuedBy: string;
  }): Promise<EnqueueResult> => {
    const now = new Date().toISOString();

    await Promise.all(
      params.payload.map((item) =>
        deps.addJob(JOB_NAMES.SKILL_MATCHER_DISPATCH, {
          task_id: item.task_id,
          title: item.title,
          required_skills: item.skills,
          initiated_by: params.enqueuedBy,
        } satisfies SkillMatcherDispatchPayload),
      ),
    );

    return {
      job_id: randomUUID(),
      queue: JOB_NAMES.SKILL_MATCHER_DISPATCH,
      enqueued_at: now,
    };
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// SkillMatcher → Staffing workflow
//
// Inject as `enqueueForOrchestrator` in makeSkillMatcherRankCandidatesTool.
//
// The tool's enqueue params do NOT include required_skills — it is not available
// inside the tool. The handler creates this factory with required_skills closed
// over from the dispatch job payload so it is carried forward to step 2.
// ──────────────────────────────────────────────────────────────────────────────

export function makeSkillMatcherEnqueue(
  context: { required_skills: string[] },
  deps: { addJob: AddJob },
) {
  return async (params: {
    task_id: string;
    ranked_candidates: RankedCandidate[];
    enqueuedBy: string;
  }): Promise<EnqueueResult> => {
    const now = new Date().toISOString();

    await deps.addJob(JOB_NAMES.AVAI_CHECKER_DISPATCH, {
      task_id: params.task_id,
      required_skills: context.required_skills,
      skill_candidates: params.ranked_candidates,
      initiated_by: params.enqueuedBy,
    } satisfies AvaiCheckerDispatchPayload);

    return {
      job_id: randomUUID(),
      queue: JOB_NAMES.AVAI_CHECKER_DISPATCH,
      enqueued_at: now,
    };
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// AvaiChecker → Staffing workflow
//
// Inject as `enqueueForOrchestrator` in makeAvaiCheckerBuildAvailabilityQueueTool.
//
// The tool's enqueue params do NOT include task_id, required_skills, or
// skill_candidates. The handler closes over all three from the dispatch payload
// so the Recommender receives the full accumulated context in one job.
// ──────────────────────────────────────────────────────────────────────────────

export function makeAvaiCheckerEnqueue(
  context: {
    task_id: string;
    required_skills: string[];
    skill_candidates: AvaiCheckerDispatchPayload['skill_candidates'];
  },
  deps: { addJob: AddJob },
) {
  return async (params: {
    results: UserAvailabilityResult[];
    enqueuedBy: string;
  }): Promise<EnqueueResult> => {
    const now = new Date().toISOString();

    await deps.addJob(JOB_NAMES.RECOMMEND_DISPATCH, {
      task_id: context.task_id,
      required_skills: context.required_skills,
      skill_candidates: context.skill_candidates,
      availability_results: params.results,
      initiated_by: params.enqueuedBy,
    } satisfies RecommendDispatchPayload);

    return {
      job_id: randomUUID(),
      queue: JOB_NAMES.RECOMMEND_DISPATCH,
      enqueued_at: now,
    };
  };
}
