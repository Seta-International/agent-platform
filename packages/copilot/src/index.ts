// Public surface of @seta/copilot — workflow-run domain only.
// Engine internals (buildMastra, model registry, workflow infra, observability)
// are reachable on subpaths (./register, ./models) consumed by apps and
// orchestrators. Contract types (SessionLike, WorkflowBuilder) live in
// @seta/copilot-sdk. Permissions on ./rbac. Events on ./events.

export type { CancelWorkflowRunOpts } from './backend/domain/cancel-workflow-run.ts';
export { cancelWorkflowRun } from './backend/domain/cancel-workflow-run.ts';
export type {
  DecideApprovalOpts,
  DecideApprovalResult,
} from './backend/domain/decide-approval.ts';
export { decideApproval } from './backend/domain/decide-approval.ts';
export type { GetWorkflowRunOpts } from './backend/domain/get-workflow-run.ts';
export { getWorkflowRun } from './backend/domain/get-workflow-run.ts';
export type { GetWorkflowRunSnapshotOpts } from './backend/domain/get-workflow-run-snapshot.ts';
export { getWorkflowRunSnapshot } from './backend/domain/get-workflow-run-snapshot.ts';
export type { WorkflowApprovalRow } from './backend/domain/list-my-pending-approvals.ts';
export { listMyPendingApprovals } from './backend/domain/list-my-pending-approvals.ts';
export type {
  ListWorkflowRunsOpts,
  ListWorkflowRunsResult,
  WorkflowRunFilters,
  WorkflowRunRow,
  WorkflowRunScope,
  WorkflowRunStartedVia,
  WorkflowRunStatus,
} from './backend/domain/list-workflow-runs.ts';
export { listWorkflowRuns } from './backend/domain/list-workflow-runs.ts';
export type {
  ReplayWorkflowFromStepOpts,
  ReplayWorkflowFromStepResult,
} from './backend/domain/replay-workflow-from-step.ts';
export { replayWorkflowFromStep } from './backend/domain/replay-workflow-from-step.ts';
export type { RerunWorkflowOpts, RerunWorkflowResult } from './backend/domain/rerun-workflow.ts';
export { rerunWorkflow } from './backend/domain/rerun-workflow.ts';

export { registerCopilotContributions } from './register.ts';
