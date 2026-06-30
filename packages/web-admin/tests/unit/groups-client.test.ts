import { describe, expect, it, vi } from 'vitest';
import { listGroups } from '../../src/groups/api/groups-client.ts';

describe('groups-client', () => {
  it('GETs /api/identity/v1/groups', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          groups: [
            {
              group_id: 'g',
              slug: 'hr',
              name: 'HR',
              kind: 'default',
              is_base: false,
              member_count: 2,
              role_slugs: [],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const rows = await listGroups();
    expect(rows[0].slug).toBe('hr');
    expect(f).toHaveBeenCalledWith('/api/identity/v1/groups', { credentials: 'include' });
  });
});
