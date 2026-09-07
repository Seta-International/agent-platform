import { describe, expect, it } from 'vitest';
import {
  accountCreatedPayload,
  accountUpdatedPayload,
  allocationCreatedPayload,
  allocationRemovedPayload,
  PM_ACCOUNT_CREATED,
  PM_ACCOUNT_RECRUITER_ASSIGNED,
  PM_ACCOUNT_RECRUITER_UNASSIGNED,
  PM_ACCOUNT_UPDATED,
  PM_ALLOCATION_REMOVED,
  PM_EVENTS,
  projectCreatedPayload,
  projectUpdatedPayload,
} from '../../src/events.ts';

describe('pm events', () => {
  it('declares pm.account.created with a valid payload schema', () => {
    expect(PM_EVENTS[PM_ACCOUNT_CREATED]).toBeDefined();
    const parsed = PM_EVENTS[PM_ACCOUNT_CREATED].safeParse({
      account_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
      name: 'Acme Corp',
      am_worker_id: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('registers the PM-2 account events', () => {
    expect(PM_EVENTS['pm.account.updated']).toBeDefined();
    expect(PM_EVENTS['pm.account.recruiter.assigned']).toBeDefined();
    expect(PM_EVENTS['pm.account.recruiter.unassigned']).toBeDefined();
  });

  it('account.updated payload requires fields[]', () => {
    expect(() =>
      PM_EVENTS['pm.account.updated'].parse({
        account_id: crypto.randomUUID(),
        tenant_id: crypto.randomUUID(),
        name: 'Acme Corp',
        am_worker_id: null,
        fields: ['name'],
      }),
    ).not.toThrow();
    expect(() =>
      PM_EVENTS['pm.account.updated'].parse({
        account_id: crypto.randomUUID(),
        tenant_id: crypto.randomUUID(),
      }),
    ).toThrow();
  });

  it('exports PM_ACCOUNT_UPDATED, PM_ACCOUNT_RECRUITER_ASSIGNED, PM_ACCOUNT_RECRUITER_UNASSIGNED constants', () => {
    expect(PM_ACCOUNT_UPDATED).toBe('pm.account.updated');
    expect(PM_ACCOUNT_RECRUITER_ASSIGNED).toBe('pm.account.recruiter.assigned');
    expect(PM_ACCOUNT_RECRUITER_UNASSIGNED).toBe('pm.account.recruiter.unassigned');
  });

  it('allocation.created carries account + lead fields', () => {
    const p = allocationCreatedPayload.parse({
      allocation_id: crypto.randomUUID(),
      project_id: crypto.randomUUID(),
      worker_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
      account_id: crypto.randomUUID(),
      account_name: 'Fabrikam',
      lead_worker_id: null,
      date_from: null,
      date_to: null,
      planned_pct: null,
      bucket: 'billable',
    });
    expect(p.account_name).toBe('Fabrikam');
  });

  it('registers pm.allocation.removed', () => {
    expect(PM_EVENTS[PM_ALLOCATION_REMOVED]).toBe(allocationRemovedPayload);
  });

  it('account.created carries name + am_worker_id', () => {
    const p = accountCreatedPayload.parse({
      account_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
      name: 'Acme Corp',
      am_worker_id: null,
    });
    expect(p.name).toBe('Acme Corp');
    expect(p.am_worker_id).toBeNull();

    const withAm = accountCreatedPayload.parse({
      account_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
      name: 'Beta Ltd',
      am_worker_id: crypto.randomUUID(),
    });
    expect(typeof withAm.am_worker_id).toBe('string');

    const missing = accountCreatedPayload.safeParse({
      account_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
    });
    expect(missing.success).toBe(false);
  });

  it('account.updated carries name + am_worker_id + fields', () => {
    const p = accountUpdatedPayload.parse({
      account_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
      name: 'Acme Corp',
      am_worker_id: crypto.randomUUID(),
      fields: ['name'],
    });
    expect(p.name).toBe('Acme Corp');
    expect(typeof p.am_worker_id).toBe('string');
    expect(p.fields).toEqual(['name']);

    const missing = accountUpdatedPayload.safeParse({
      account_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
      fields: ['name'],
    });
    expect(missing.success).toBe(false);
  });

  it('project.created payload requires name', () => {
    const valid = projectCreatedPayload.safeParse({
      project_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
      account_id: crypto.randomUUID(),
      charter_id: crypto.randomUUID(),
      name: 'Alpha Project',
      date_to: null,
    });
    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data.name).toBe('Alpha Project');

    const missing = projectCreatedPayload.safeParse({
      project_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
      account_id: crypto.randomUUID(),
      charter_id: crypto.randomUUID(),
    });
    expect(missing.success).toBe(false);
  });

  it('project.updated payload requires name + account_id and still carries fields', () => {
    const valid = projectUpdatedPayload.safeParse({
      project_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
      name: 'Beta Project',
      account_id: crypto.randomUUID(),
      date_to: null,
      fields: ['name', 'objective'],
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.name).toBe('Beta Project');
      expect(valid.data.fields).toEqual(['name', 'objective']);
    }

    const missingName = projectUpdatedPayload.safeParse({
      project_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
      account_id: crypto.randomUUID(),
      fields: ['name'],
    });
    expect(missingName.success).toBe(false);

    const missingAccountId = projectUpdatedPayload.safeParse({
      project_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
      name: 'Gamma Project',
      fields: ['name'],
    });
    expect(missingAccountId.success).toBe(false);
  });

  it('allocationCreatedPayload accepts the enriched span fields', () => {
    const parsed = allocationCreatedPayload.safeParse({
      allocation_id: crypto.randomUUID(),
      project_id: crypto.randomUUID(),
      worker_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
      account_id: crypto.randomUUID(),
      account_name: 'Acme',
      lead_worker_id: null,
      date_from: '2026-01-01',
      date_to: '2026-12-31',
      planned_pct: 100,
      bucket: 'billable',
    });
    expect(parsed.success).toBe(true);
  });

  it('allocationCreatedPayload rejects an unknown bucket', () => {
    const parsed = allocationCreatedPayload.safeParse({
      allocation_id: crypto.randomUUID(),
      project_id: crypto.randomUUID(),
      worker_id: null,
      tenant_id: crypto.randomUUID(),
      account_id: crypto.randomUUID(),
      account_name: 'Acme',
      lead_worker_id: null,
      date_from: null,
      date_to: null,
      planned_pct: null,
      bucket: 'leave',
    });
    expect(parsed.success).toBe(false);
  });

  it('registers charter + project event schemas', () => {
    for (const t of [
      'pm.charter.submitted',
      'pm.charter.updated',
      'pm.charter.approved',
      'pm.charter.rejected',
      'pm.charter.withdrawn',
      'pm.project.created',
      'pm.project.updated',
      'pm.project.access.changed',
      'pm.project.staffing_plan.changed',
    ]) {
      expect(PM_EVENTS[t as keyof typeof PM_EVENTS]).toBeDefined();
    }
    expect(
      PM_EVENTS['pm.project.created'].safeParse({
        project_id: crypto.randomUUID(),
        tenant_id: crypto.randomUUID(),
        account_id: crypto.randomUUID(),
        charter_id: crypto.randomUUID(),
        name: 'Test Project',
        date_to: null,
      }).success,
    ).toBe(true);
  });
});
