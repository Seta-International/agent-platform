import { describe, expect, it } from 'vitest';
import { HIRING_PERMISSIONS } from '../../src/rbac.ts';

describe('hiring rbac', () => {
  it('declares the requisition read + open permissions', () => {
    expect(HIRING_PERMISSIONS).toContain('hiring.requisition.read');
    expect(HIRING_PERMISSIONS).toContain('hiring.requisition.open');
  });
});
