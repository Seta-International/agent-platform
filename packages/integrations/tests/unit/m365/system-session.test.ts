import { describe, expect, it } from 'vitest';
import { buildSystemSession } from '../../../src/backend/m365/system-session.ts';

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

  it('can act on people for the directory sync', () => {
    const s = buildSystemSession('11111111-1111-1111-1111-111111111111');
    for (const p of ['people.worker.read', 'people.worker.create', 'people.worker.update']) {
      expect(s.permissions.has(p), `missing ${p}`).toBe(true);
    }
  });
});
