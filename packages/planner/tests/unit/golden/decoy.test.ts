import { describe, expect, it } from 'vitest';
import { DECOY_TENANT_ID, TENANT_ID } from '../../fixtures/golden/constants.ts';
import { buildDecoyFixture } from '../../fixtures/golden/decoy.ts';

describe('decoy fixture', () => {
  const f = buildDecoyFixture();
  it('all records belong to the decoy tenant, never the main tenant', () => {
    for (const t of f.tasks) {
      expect(t.tenant_id).toBe(DECOY_TENANT_ID);
      expect(t.tenant_id).not.toBe(TENANT_ID);
    }
    for (const u of f.users) expect(u.tenant_id).toBe(DECOY_TENANT_ID);
  });
  it('collides by name with a main-tenant landmark (Tuan Nguyen)', () => {
    expect(f.users.some((u) => u.display_name === 'Tuan Nguyen')).toBe(true);
  });
  it('embeds canary strings for leak detection', () => {
    const billing = f.tasks.find((t) => t.title.includes('Migrate billing schema'));
    expect(billing?.title).toContain('ZEPHYR-91');
    expect(f.users.some((u) => (u.bio ?? '').includes('DECOY-TENANT-CANARY-742'))).toBe(true);
  });
});
