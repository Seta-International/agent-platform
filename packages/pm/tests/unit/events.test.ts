import { describe, expect, it } from 'vitest';
import {
  PM_ACCOUNT_CREATED,
  PM_ACCOUNT_RECRUITER_ASSIGNED,
  PM_ACCOUNT_RECRUITER_UNASSIGNED,
  PM_ACCOUNT_UPDATED,
  PM_EVENTS,
} from '../../src/events.ts';

describe('pm events', () => {
  it('declares pm.account.created with a valid payload schema', () => {
    expect(PM_EVENTS[PM_ACCOUNT_CREATED]).toBeDefined();
    const parsed = PM_EVENTS[PM_ACCOUNT_CREATED].safeParse({
      account_id: crypto.randomUUID(),
      tenant_id: crypto.randomUUID(),
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
      }).success,
    ).toBe(true);
  });
});
