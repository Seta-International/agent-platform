// Public surface for composing the assignment orchestration runtime (specialized
// agents + assignment DAG, relocated from @seta/staffing) at the app tier.
export {
  makeAssign,
  makeAvailability,
  makeSkillSearch,
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

// Public surface for composing the planner QnA runtime at the app tier.
export {
  buildPlannerQnaRuntime,
  type PlannerQnaRuntime,
  type PlannerQnaRuntimeDeps,
} from './backend/orchestration/register.ts';
// Weekly planner runtime (weekly_planner chat intent).
export {
  buildWeeklyPlanRuntime,
  type WeeklyPlanRuntime,
  type WeeklyPlanRuntimeDeps,
} from './backend/orchestration/weekly-plan/register.ts';
