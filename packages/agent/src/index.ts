// Public surface of @seta/agent — workflow-run domain + the model resolver.
// Engine internals (buildMastra, workflow infra, observability) are reachable
// on the ./register subpath consumed by apps. `resolveModel` is exported here so
// the composition root (apps/server) can inject a model into orchestrator
// adapters (orchestrator modules may not import the agent engine directly).
// Contract types (SessionLike, WorkflowBuilder) live in @seta/agent-sdk.
// Permissions on ./rbac. Events on ./events.

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

export { ModelNotFoundError, resolveModel } from './backend/model-registry.ts';
export { registerAgentContributions } from './register.ts';
