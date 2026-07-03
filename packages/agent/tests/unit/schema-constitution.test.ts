import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  APPROVAL_STATUS,
  tenantSettings,
  WORKFLOW_RUN_STATUS,
  workflowApprovals,
  workflowRunEventsSeen,
  workflowRunSteps,
  workflowRuns,
} from '../../src/backend/db/schema.ts';

describe('agent schema constitution', () => {
  it('workflow_run_steps PK is (tenant_id, run_id, step_id) with a confidence CHECK and cascade FK', () => {
    const cfg = getTableConfig(workflowRunSteps);
    expect(cfg.primaryKeys[0]?.columns.map((c) => c.name)).toEqual([
      'tenant_id',
      'run_id',
      'step_id',
    ]);
    expect(cfg.checks.some((c) => c.name === 'workflow_run_steps_confidence_check')).toBe(true);
    expect(cfg.foreignKeys.length).toBeGreaterThan(0);
    expect(cfg.foreignKeys[0]?.onDelete).toBe('cascade');
  });

  it('workflow_runs carries state/result jsonb, a tenant-led source-event unique, and a status enum CHECK', () => {
    const cfg = getTableConfig(workflowRuns);
    const cols = cfg.columns.map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['state', 'result']));
    const sourceEventUnique = cfg.indexes.find(
      (i) => i.config.name === 'workflow_runs_source_event_id_idx',
    );
    expect(sourceEventUnique?.config.columns.map((c) => (c as { name: string }).name)).toEqual([
      'tenant_id',
      'source_event_id',
    ]);
    expect(cfg.checks.some((c) => c.name === 'workflow_runs_status_check')).toBe(true);
    expect(WORKFLOW_RUN_STATUS).toContain('running');
    expect(WORKFLOW_RUN_STATUS).toContain('success');
  });

  it('workflow_approvals has tenant_id and a status enum CHECK', () => {
    const cfg = getTableConfig(workflowApprovals);
    expect(cfg.columns.some((c) => c.name === 'tenant_id')).toBe(true);
    expect(cfg.checks.some((c) => c.name === 'workflow_approvals_status_check')).toBe(true);
    expect(APPROVAL_STATUS).toContain('pending');
  });

  it('workflow_run_events_seen has tenant_id and a cascade FK to workflow_runs', () => {
    const cfg = getTableConfig(workflowRunEventsSeen);
    expect(cfg.columns.some((c) => c.name === 'tenant_id')).toBe(true);
    expect(cfg.foreignKeys.length).toBeGreaterThan(0);
    expect(cfg.foreignKeys[0]?.onDelete).toBe('cascade');
  });

  it('tenant_settings gains created_at', () => {
    const cfg = getTableConfig(tenantSettings);
    expect(cfg.columns.some((c) => c.name === 'created_at')).toBe(true);
  });
});
