import { describe, expect, it } from 'vitest';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

describe('migration: m365_group_links + m365_subscriptions', () => {
  it('m365_group_links table has all required columns', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      const { rows } = await pool.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type
           FROM information_schema.columns
          WHERE table_schema = 'integrations'
            AND table_name   = 'm365_group_links'
          ORDER BY column_name`,
      );
      const cols = rows.map((r) => r.column_name);
      expect(cols).toEqual(
        expect.arrayContaining([
          'id',
          'tenant_id',
          'group_id',
          'external_id',
          'delta_link',
          'last_synced_at',
          'last_synced_fields',
          'sync_status',
          'last_error',
          'unlinked_at',
          'created_at',
          'updated_at',
        ]),
      );
    });
  });

  it('m365_group_links table has correct column types for key columns', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      const { rows } = await pool.query<{
        column_name: string;
        data_type: string;
        udt_name: string;
      }>(
        `SELECT column_name, data_type, udt_name
           FROM information_schema.columns
          WHERE table_schema = 'integrations'
            AND table_name   = 'm365_group_links'`,
      );
      const byName = Object.fromEntries(rows.map((r) => [r.column_name, r]));

      expect(byName.id?.udt_name).toBe('uuid');
      expect(byName.tenant_id?.udt_name).toBe('uuid');
      expect(byName.group_id?.udt_name).toBe('uuid');
      expect(byName.external_id?.data_type).toBe('text');
      expect(byName.last_synced_fields?.data_type).toBe('jsonb');
      expect(byName.sync_status?.data_type).toBe('text');
      expect(byName.last_synced_at?.data_type).toBe('timestamp with time zone');
      expect(byName.unlinked_at?.data_type).toBe('timestamp with time zone');
    });
  });

  it('m365_group_links has the status check constraint', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      const { rows } = await pool.query<{ constraint_name: string }>(
        `SELECT conname AS constraint_name
           FROM pg_constraint c
           JOIN pg_class     t ON t.oid = c.conrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = 'integrations'
            AND t.relname = 'm365_group_links'
            AND c.contype = 'c'
            AND conname   = 'm365_group_links_status_check'`,
      );
      expect(rows).toHaveLength(1);
    });
  });

  it('m365_group_links has the expected indexes', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      const { rows } = await pool.query<{ indexname: string }>(
        `SELECT indexname
           FROM pg_indexes
          WHERE schemaname = 'integrations'
            AND tablename  = 'm365_group_links'
          ORDER BY indexname`,
      );
      const names = rows.map((r) => r.indexname);
      expect(names).toEqual(
        expect.arrayContaining([
          'm365_group_links_by_status',
          'm365_group_links_uniq_external_live',
          'm365_group_links_uniq_group_live',
        ]),
      );
    });
  });

  it('partial unique indexes carry the unlinked_at IS NULL predicate', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      const { rows } = await pool.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef
           FROM pg_indexes
          WHERE schemaname = 'integrations'
            AND indexname IN ('m365_group_links_uniq_group_live', 'm365_group_links_uniq_external_live')`,
      );
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.indexdef).toMatch(/WHERE \(unlinked_at IS NULL\)/);
      }
    });
  });

  it('m365_group_links column defaults and nullability', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      const { rows } = await pool.query<{
        column_name: string;
        column_default: string | null;
        is_nullable: string;
      }>(
        `SELECT column_name, column_default, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'integrations'
            AND table_name   = 'm365_group_links'
            AND column_name  IN ('sync_status', 'delta_link', 'last_synced_fields')`,
      );
      const byName = Object.fromEntries(rows.map((r) => [r.column_name, r]));

      expect(byName.sync_status?.column_default).toMatch(/'idle'/);
      expect(byName.delta_link?.is_nullable).toBe('YES');
      expect(byName.last_synced_fields?.is_nullable).toBe('NO');
    });
  });

  it('m365_subscriptions table has all required columns', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      const { rows } = await pool.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'integrations'
            AND table_name   = 'm365_subscriptions'
          ORDER BY column_name`,
      );
      const cols = rows.map((r) => r.column_name);
      expect(cols).toEqual(
        expect.arrayContaining([
          'id',
          'tenant_id',
          'subscription_id',
          'resource',
          'change_type',
          'expiration_at',
          'client_state_hmac',
          'renewal_job_id',
          'created_at',
          'updated_at',
        ]),
      );
    });
  });

  it('m365_subscriptions has the unique index on tenant_id + resource', async () => {
    await withIntegrationsTestDb(async ({ pool }) => {
      const { rows } = await pool.query<{ indexname: string; indisunique: boolean }>(
        `SELECT i.relname AS indexname, ix.indisunique
           FROM pg_index       ix
           JOIN pg_class       i  ON i.oid  = ix.indexrelid
           JOIN pg_class       t  ON t.oid  = ix.indrelid
           JOIN pg_namespace   n  ON n.oid  = t.relnamespace
          WHERE n.nspname = 'integrations'
            AND t.relname = 'm365_subscriptions'
            AND i.relname = 'm365_subscriptions_uniq_tenant_resource'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.indisunique).toBe(true);
    });
  });
});
