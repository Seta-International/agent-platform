import { describe, expect, it } from 'vitest';
import { A2_PERMISSIONS } from '../src/roles.ts';

describe('A2_PERMISSIONS', () => {
  it('includes identity.user.write.self', () => {
    expect(A2_PERMISSIONS).toContain('identity.user.write.self');
  });
});
