// Public surface for composing the assignment orchestration runtime (specialized
// agents + assignment DAG, relocated from @seta/staffing) at the app tier.

// The A2 allowlist itself. Exported so apps/server — the only layer that can
// supply a real PreviewPort — can drive the write tools without a model, which is
// what makes FUT-840's invariant matrix deterministic.
export { makeActionTools } from './backend/orchestration/action/orchestrator.tools.ts';
// Declared by planner, implemented in apps/server: the approval rows live in the
// `agent` schema, which planner may not read (FUT-840).
// A2 Action runtime (mutate chat intent).
export type {
  ActionPorts,
  LoadedPreview,
  PreviewPort,
} from './backend/orchestration/action/ports.ts';
export {
  buildPlannerActionRuntime,
  makeActionPorts,
  type PlannerActionRuntime,
  type PlannerActionRuntimeDeps,
} from './backend/orchestration/action/register.ts';
// Part 3's chat router types its widened `action` dep with these (FUT-840).
export {
  type ActionOpenPreview,
  OpenPreviewSchema,
  type UpdateTaskResume,
} from './backend/orchestration/action/schemas.ts';
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
