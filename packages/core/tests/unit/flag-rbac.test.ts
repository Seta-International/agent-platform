import { describe, expect, it } from 'vitest';
import { CORE_PERMISSIONS } from '../../src/rbac.ts';

describe('core feature_flag rbac', () => {
  it('declares read + write verbs', () => {
    expect(CORE_PERMISSIONS).toContain('core.feature_flag.read');
    expect(CORE_PERMISSIONS).toContain('core.feature_flag.write');
  });
});
