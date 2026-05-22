import { describe, expect, it } from 'vitest';
import { withCoreTestDb } from '../test/test-helpers.ts';

describe('core.notifications schema', () => {
  it('has expected columns and the unique (source_event_id, user_id) constraint', async () => {
    await withCoreTestDb(async ({ pool }) => {
      const cols = await pool.query<{ column_name: string; data_type: string }>(`
        SELECT column_name, data_type
          FROM information_schema.columns
         WHERE table_schema = 'core' AND table_name = 'notifications'
         ORDER BY ordinal_position
      `);
      expect(cols.rows.map((r) => r.column_name)).toEqual([
        'id',
        'tenant_id',
        'user_id',
        'event_type',
        'source_event_id',
        'payload',
        'created_at',
        'read_at',
        'dismissed_at',
      ]);

      const uniq = await pool.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM pg_constraint c
           WHERE c.conrelid = 'core.notifications'::regclass
             AND c.contype = 'u'
             AND (
               SELECT array_agg(a.attname::text ORDER BY a.attname::text)
                 FROM unnest(c.conkey) AS k(attnum)
                 JOIN pg_attribute a
                   ON a.attrelid = c.conrelid AND a.attnum = k.attnum
             ) = ARRAY['source_event_id', 'user_id']
        ) AS exists
      `);
      expect(uniq.rows[0]?.exists).toBe(true);

      const idx = await pool.query<{ indexname: string }>(`
        SELECT indexname FROM pg_indexes
         WHERE schemaname = 'core' AND tablename = 'notifications'
           AND indexname = 'notifications_unread_idx'
      `);
      expect(idx.rows).toHaveLength(1);
    });
  });
});
