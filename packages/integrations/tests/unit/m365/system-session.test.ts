import { describe, expect, it } from 'vitest';
import { buildSystemSession } from '../../../src/m365/system-session.ts';

describe('buildSystemSession', () => {
  it('sets tenant_id from argument', () => {
    expect(buildSystemSession('tenant-x').tenant_id).toBe('tenant-x');
  });

  it('sets actor.kind to system', () => {
    expect(buildSystemSession('tenant-x').actor?.kind).toBe('system');
  });

  it('includes system.integrations.m365 in role_summary.roles', () => {
    expect(buildSystemSession('tenant-x').role_summary.roles).toContain('system.integrations.m365');
  });

  it('accessible_group_ids is an empty array', () => {
    expect(buildSystemSession('tenant-x').accessible_group_ids).toEqual([]);
  });
});
