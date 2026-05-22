import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../src/db/client.ts';
import { waitFor, withCoreTestDb, withDispatcher } from '../test/test-helpers.ts';

// Regression: the dispatcher cursor used to advance by `id > lastId` (UUID lexicographic
// comparison). With v4 random UUIDs, an event whose id sorts below the current cursor was
// silently skipped — permanently, since the cursor never moved back. Filtering must use
// (occurred_at, id) tuple comparison so chronological order, not UUID byte order, decides
// what's "next."
describe('dispatcher cursor advancement', () => {
  it('processes events with smaller UUIDs than the current cursor', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();

      const processed: string[] = [];
      const sub = {
        subscription: 'test.uuid-ordering',
        event: 'test.uuid.thing',
        eventVersion: 1,
        handler: async (e: { id: string }) => {
          processed.push(e.id);
        },
      };

      // Two UUIDs straddling the lexicographic midpoint. HIGH > LOW byte-wise.
      const HIGH_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      const LOW_ID = '00000000-0000-4000-8000-000000000001';
      const tenantId = '00000000-0000-0000-0000-000000000001';

      // Insert HIGH first, with an OLDER occurred_at.
      await pool.query(
        `INSERT INTO core.events (id, occurred_at, tenant_id, aggregate_type, aggregate_id,
                                  event_type, event_version, payload)
         VALUES ($1, now() - interval '10 seconds', $2, 'test', 'test',
                 'test.uuid.thing', 1, '{}'::jsonb)`,
        [HIGH_ID, tenantId],
      );

      await withDispatcher({ subscribers: [sub], pool }, async () => {
        // Cursor should advance to HIGH_ID.
        await waitFor(() => processed.includes(HIGH_ID));

        // Now insert LOW (newer occurred_at). With the buggy filter, this would be skipped
        // forever because LOW < HIGH lexicographically.
        await pool.query(
          `INSERT INTO core.events (id, occurred_at, tenant_id, aggregate_type, aggregate_id,
                                    event_type, event_version, payload)
           VALUES ($1, now(), $2, 'test', 'test', 'test.uuid.thing', 1, '{}'::jsonb)`,
          [LOW_ID, tenantId],
        );

        await waitFor(() => processed.includes(LOW_ID));
        // At-least-once delivery is OK; the critical assertion is that LOW gets
        // processed at all even though it sorts below the cursor lexicographically.
        expect(processed).toContain(HIGH_ID);
        expect(processed).toContain(LOW_ID);
      });
    });
  });
});
