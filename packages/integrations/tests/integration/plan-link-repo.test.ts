import { describe, expect, it } from 'vitest';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

describe('m365_resource_etags migration', () => {
  it('creates table with correct column order', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      const { rows } = await pool.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'integrations'
          AND table_name = 'm365_resource_etags'
        ORDER BY ordinal_position
      `);
      const names = rows.map((r) => r.column_name);
      expect(names).toEqual([
        'id',
        'tenant_id',
        'plan_link_id',
        'resource_type',
        'seta_id',
        'external_id',
        'etag',
        'last_synced_fields',
        'updated_at',
      ]);
    });
  });

  it('has at least one FK constraint', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      const { rows } = await pool.query<{ conname: string }>(`
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'integrations'
          AND t.relname = 'm365_resource_etags'
          AND c.contype = 'f'
      `);
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('m365_plan_links migration', () => {
  it('creates table with correct column order', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      const { rows } = await pool.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'integrations'
          AND table_name = 'm365_plan_links'
        ORDER BY ordinal_position
      `);
      const names = rows.map((r) => r.column_name);
      expect(names).toEqual([
        'id',
        'tenant_id',
        'group_id',
        'plan_id',
        'external_id',
        'last_synced_at',
        'last_synced_snapshot',
        'sync_status',
        'last_error',
        'last_reconcile_at',
        'unlinked_at',
        'created_at',
        'updated_at',
      ]);
    });
  });

  it('has the correct partial unique and regular indexes', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      const { rows } = await pool.query<{ indexname: string }>(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'integrations'
          AND tablename = 'm365_plan_links'
      `);
      const indexNames = rows.map((r) => r.indexname);
      expect(indexNames).toContain('m365_plan_links_uniq_plan_live');
      expect(indexNames).toContain('m365_plan_links_uniq_external_live');
      expect(indexNames).toContain('m365_plan_links_by_group_live');
    });
  });
});
