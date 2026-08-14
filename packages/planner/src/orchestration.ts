// Public surface for composing the assignment orchestration runtime (specialized
// agents + assignment DAG, relocated from @seta/staffing) at the app tier.

// Declared by planner, implemented in apps/server: the approval rows live in the
// `agent` schema, which planner may not read (FUT-840).
export type { LoadedPreview, PreviewPort } from './backend/orchestration/action/ports.ts';
// A2 Action runtime (mutate chat intent).
export {
  buildPlannerActionRuntime,
  type PlannerActionRuntime,
  type PlannerActionRuntimeDeps,
} from './backend/orchestration/action/register.ts';
export type { UpdateTaskResume } from './backend/orchestration/action/schemas.ts';
export {
  makeAssign,
  makeAvailability,
  makeSkillSearch,
  makeTaskAssignees,
  makeTaskReader,
  makeTaskSearch,
  makeUserProfileLookup,
} from './backend/orchestration/assignment/adapters.ts';
export {
  __setAssignmentRunIdForTests,
  type AssignmentOrchestrationRuntime,
  type AssignmentPorts,
  buildAssignmentOrchestrationRuntime,
} from './backend/orchestration/assignment/register.ts';
// Eval-target factory for @seta/shared-agent-evals consumption.
export {
  buildPlannerQueryEvalTarget,
  type PlannerQueryEvalTarget,
} from './backend/orchestration/eval-target.ts';
// Public surface for composing the planner Query runtime at the app tier.
export {
  buildPlannerQueryRuntime,
  type PlannerQueryRuntime,
  type PlannerQueryRuntimeDeps,
} from './backend/orchestration/register.ts';
// Weekly planner runtime (weekly_planner chat intent).
export {
  buildWeeklyPlanRuntime,
  type WeeklyPlanRuntime,
  type WeeklyPlanRuntimeDeps,
} from './backend/orchestration/weekly-plan/register.ts';
