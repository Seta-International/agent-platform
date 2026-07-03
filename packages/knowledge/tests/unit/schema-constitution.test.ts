import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { files } from '../../src/backend/db/schema.ts';

describe('knowledge schema constitution', () => {
  it('files.id is uuid and s3_key is tenant-scoped unique', () => {
    const cfg = getTableConfig(files);
    expect(cfg.columns.find((c) => c.name === 'id')?.getSQLType()).toBe('uuid');
    const s3 = cfg.indexes.find((i) => i.config.name === 'files_uniq_s3_key_per_tenant');
    const first = s3?.config.columns[0];
    expect(first && 'name' in first ? first.name : '').toBe('tenant_id');
  });

  it('origin=chat implies thread_id (CHECK present) and files carry updated_at', () => {
    const cfg = getTableConfig(files);
    expect(cfg.checks.some((c) => c.name === 'files_origin_thread_check')).toBe(true);
    expect(cfg.columns.some((c) => c.name === 'updated_at')).toBe(true);
  });
});
