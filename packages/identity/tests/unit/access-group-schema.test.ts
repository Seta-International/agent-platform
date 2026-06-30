import { describe, expect, it } from 'vitest';
import {
  accessGroup,
  accessGroupMembership,
  accessGroupRole,
} from '../../src/backend/db/schema.ts';

describe('access group schema', () => {
  it('exposes the three tables with expected columns', () => {
    expect(Object.keys(accessGroup)).toEqual(
      expect.arrayContaining(['id', 'tenant_id', 'slug', 'name', 'kind', 'is_base']),
    );
    expect(Object.keys(accessGroupMembership)).toEqual(
      expect.arrayContaining(['group_id', 'user_id']),
    );
    expect(Object.keys(accessGroupRole)).toEqual(expect.arrayContaining(['group_id', 'role_slug']));
  });
});
