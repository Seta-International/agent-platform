export type { DecideApprovalOpts, DecideApprovalResult } from './backend/domain/decide-approval.ts';
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
export type { RerunWorkflowOpts, RerunWorkflowResult } from './backend/domain/rerun-workflow.ts';
export { rerunWorkflow } from './backend/domain/rerun-workflow.ts';
export { embeddingJobs } from './backend/embeddings/register-jobs.ts';
export type {
  DeleteKnowledgeFileDeps,
  DeleteKnowledgeFileInput,
} from './backend/knowledge/delete-file.ts';
export { deleteKnowledgeFile } from './backend/knowledge/delete-file.ts';
export type {
  KnowledgeFileSummary,
  ListKnowledgeFilesInput,
} from './backend/knowledge/list-files.ts';
export { listKnowledgeFiles } from './backend/knowledge/list-files.ts';
export type { MarkProcessedDeps, MarkProcessedInput } from './backend/knowledge/mark-processed.ts';
export { markKnowledgeFileProcessed } from './backend/knowledge/mark-processed.ts';
export type {
  RequestKnowledgeUploadInput,
  RequestKnowledgeUploadResult,
} from './backend/knowledge/upload-url.ts';
export { requestKnowledgeUpload } from './backend/knowledge/upload-url.ts';
export { bindOtel, otel } from './backend/observability.ts';
export type { SessionLike } from './backend/types.ts';
export type { ResumeRetryDeps, ResumeRetryResult } from './backend/workflows/resume-retry.ts';
export { resumeRetry } from './backend/workflows/resume-retry.ts';
export type { SweepDeps, SweepResult } from './backend/workflows/sweeper.ts';
export { sweepWorkflowApprovals } from './backend/workflows/sweeper.ts';
export type { CopilotEvent } from './events/index.ts';
export type { CopilotPermission } from './permissions.ts';
export { COPILOT_PERMISSIONS } from './permissions.ts';
export type { CopilotHandle } from './register.ts';
export { registerCopilot, registerCopilotContributions } from './register.ts';
