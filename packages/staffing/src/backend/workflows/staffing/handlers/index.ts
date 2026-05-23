import type { TaskList } from 'graphile-worker';
import { JOB_NAMES } from '../types.ts';
import {
  type AvaiCheckerDispatchDeps,
  makeAvaiCheckerDispatchHandler,
} from './on-avai-checker-dispatch.ts';
import {
  makeRecommendDispatchHandler,
  type RecommendDispatchDeps,
} from './on-recommend-dispatch.ts';
import {
  makeSkillMatcherDispatchHandler,
  type SkillMatcherDispatchDeps,
} from './on-skill-matcher-dispatch.ts';

// ──────────────────────────────────────────────────────────────────────────────
// Staffing workflow task list — injected into startWorkerPool via opts.jobs.
//
// Usage in apps/server/src/index.ts:
//
//   import { makeStaffingTaskList } from '@seta/copilot';
//
//   const workers = await startWorkerPool({
//     pool: getPool('worker'),
//     jobs: {
//       ...makeStaffingTaskList({
//         runSkillMatcherAgent: ...,
//         runAvaiCheckerAgent:  ...,
//         rolePriority:         { manager: 3, senior_engineer: 2, developer: 1 },
//         onResult:             async (result) => { /* deliver to user */ },
//       }),
//       'mailer:send': async (payload) => { ... },
//     },
//   });
// ──────────────────────────────────────────────────────────────────────────────

export type StaffingTaskListDeps = SkillMatcherDispatchDeps &
  AvaiCheckerDispatchDeps &
  RecommendDispatchDeps;

export function makeStaffingTaskList(deps: StaffingTaskListDeps): TaskList {
  return {
    [JOB_NAMES.SKILL_MATCHER_DISPATCH]: makeSkillMatcherDispatchHandler(
      deps,
    ) as unknown as TaskList[string],
    [JOB_NAMES.AVAI_CHECKER_DISPATCH]: makeAvaiCheckerDispatchHandler(
      deps,
    ) as unknown as TaskList[string],
    [JOB_NAMES.RECOMMEND_DISPATCH]: makeRecommendDispatchHandler(
      deps,
    ) as unknown as TaskList[string],
  };
}

export type { AvaiCheckerDispatchDeps, RecommendDispatchDeps, SkillMatcherDispatchDeps };
