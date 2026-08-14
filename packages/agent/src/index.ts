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
// `recordApprovalDecision` is the record-only half of `decideApproval` — it
// closes the approval and its synthetic run row without needing a Mastra
// instance to resume into. Public so a cross-tier test can drive Cancel exactly
// as the chat decide route does (FUT-840).
export { decideApproval, recordApprovalDecision } from './backend/domain/decide-approval.ts';
export type {
  FindOpenChatPreviewOpts,
  FindOpenPreviewsForTasksOpts,
  LoadChatPreviewByIdOpts,
  OpenChatPreview,
  PreviewScope,
} from './backend/domain/find-open-chat-preview.ts';
export {
  findOpenChatPreview,
  findOpenPreviewsForTasks,
  loadChatPreviewById,
} from './backend/domain/find-open-chat-preview.ts';
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
// The one-preview-per-task refusal, public so a caller above the agent tier can
// tell it apart from a genuine write failure (FUT-840 design D11).
// `writeChatApprovalRow` is public for the same reason: projecting a card into
// the read model is the agent tier's job, but the only layer that can drive it
// against a REAL planner card is apps/server, which composes both tiers.
export {
  PendingTaskPreviewExistsError,
  writeChatApprovalRow,
} from './backend/domain/write-chat-approval-row.ts';

export { ModelNotFoundError, resolveModel } from './backend/model-registry.ts';
export { AgentRunStateRepository } from './backend/orchestration/run-state-repository.ts';
export { registerAgentContributions } from './register.ts';
