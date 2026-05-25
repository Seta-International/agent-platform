// Module-facing read surface. Feature modules import from
// `@seta/copilot/agent-reads` to surface copilot-owned state (e.g. in-flight
// workflow runs) through their own agent tools. Scope deliberately tiny —
// each export must justify why a cross-module read is needed.
//
// Permitted by `.dependency-cruiser.cjs` `modules-no-copilot-internals` rule
// (alongside `./rbac` and `./events`).

export {
  type GetPendingAssignRunIdForTaskOpts,
  getPendingAssignRunIdForTask,
} from './backend/domain/get-pending-assign-run-for-task.ts';
