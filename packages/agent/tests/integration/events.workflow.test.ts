import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../src/events/types.ts';

describe('agent workflow event types', () => {
  it('compiles the five new union members', () => {
    const evts: AgentEvent[] = [
      {
        type: 'agent.workflow.run.completed',
        aggregate_id: '00000000-0000-0000-0000-000000000001',
        data: {
          workflow_id: 'agent.new-task-skill-tag',
          tenant_id: '00000000-0000-0000-0000-000000000002',
          started_by: '00000000-0000-0000-0000-000000000003',
          duration_ms: 1234,
          outcome: 'success',
          summary: { task_id: '00000000-0000-0000-0000-000000000004' },
        },
      },
      {
        type: 'agent.workflow.run.failed',
        aggregate_id: '00000000-0000-0000-0000-000000000001',
        data: {
          workflow_id: 'agent.x',
          tenant_id: '00000000-0000-0000-0000-000000000002',
          started_by: '00000000-0000-0000-0000-000000000003',
          duration_ms: 500,
          error: { code: 'boom', message: 'oops' },
        },
      },
      {
        type: 'agent.workflow.approval.requested',
        aggregate_id: '00000000-0000-0000-0000-000000000001',
        data: {
          approval_id: '00000000-0000-0000-0000-000000000005',
          workflow_id: 'agent.x',
          tenant_id: '00000000-0000-0000-0000-000000000002',
          approver_user_id: '00000000-0000-0000-0000-000000000006',
          proposed_payload: { user_id: '00000000-0000-0000-0000-000000000007' },
          expires_at: '2026-05-28T00:00:00Z',
          surface: ['canvas'],
        },
      },
      {
        type: 'agent.workflow.approval.decided',
        aggregate_id: '00000000-0000-0000-0000-000000000001',
        data: {
          approval_id: '00000000-0000-0000-0000-000000000005',
          decision: 'approve',
          decided_by: '00000000-0000-0000-0000-000000000006',
          decided_at: '2026-05-21T00:00:00Z',
        },
      },
      {
        type: 'agent.workflow.run.rerun_requested',
        aggregate_id: '00000000-0000-0000-0000-000000000010',
        data: {
          parent_run_id: '00000000-0000-0000-0000-000000000001',
          workflow_id: 'agent.x',
          tenant_id: '00000000-0000-0000-0000-000000000002',
          requested_by: '00000000-0000-0000-0000-000000000003',
        },
      },
    ];
    expect(evts).toHaveLength(5);
  });
});
