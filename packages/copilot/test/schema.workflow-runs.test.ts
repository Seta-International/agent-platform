import { describe, expect, it } from 'vitest';
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
