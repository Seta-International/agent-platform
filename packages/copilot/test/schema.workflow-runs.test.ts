import { describe, expect, it } from 'vitest';
import { workflowApprovals } from '../src/db/schema.workflow-approvals.ts';
import { workflowRunEventsSeen } from '../src/db/schema.workflow-events-seen.ts';
import { workflowRuns } from '../src/db/schema.workflow-runs.ts';

describe('copilot.workflow_runs table', () => {
  it('exposes the columns the lifecycle hook writes', () => {
    const cols = Object.keys(workflowRuns);
    for (const c of [
      'runId',
      'workflowId',
      'tenantId',
      'startedBy',
      'startedVia',
      'parentThreadId',
      'parentRunId',
      'sourceEventId',
      'inputSummary',
      'status',
      'suspendReason',
      'errorSummary',
      'startedAt',
      'finishedAt',
      'durationMs',
    ]) {
      expect(cols).toContain(c);
    }
  });
});

describe('copilot.workflow_approvals table', () => {
  it('exposes the columns the lifecycle hook + decideApproval write', () => {
    const cols = Object.keys(workflowApprovals);
    for (const c of [
      'approvalId',
      'runId',
      'stepId',
      'proposedPayload',
      'approverUserId',
      'fallbackApproverUserId',
      'surfaceCanvas',
      'surfaceChatThreadId',
      'status',
      'decisionPayload',
      'decidedBy',
      'decidedAt',
      'expiresAt',
      'createdAt',
    ]) {
      expect(cols).toContain(c);
    }
  });
});

describe('copilot.workflow_run_events_seen table', () => {
  it('has composite PK columns the lifecycle hook checks', () => {
    const cols = Object.keys(workflowRunEventsSeen);
    expect(cols).toContain('runId');
    expect(cols).toContain('eventSeq');
  });
});
