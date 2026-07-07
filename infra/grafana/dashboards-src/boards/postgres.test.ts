import { describe, expect, it } from 'vitest';
import { buildPostgres } from './postgres';

describe('postgres', () => {
  const d = buildPostgres().build();
  it('uid + env from pg_up', () => {
    expect(d.uid).toBe('postgresql');
    expect(JSON.stringify(d.templating)).toContain('label_values(pg_up, env)');
  });
  it('has cache-hit and deadlock panels', () => {
    const json = JSON.stringify(d.panels);
    expect(json).toContain('pg_stat_database_blks_hit');
    expect(json).toContain('pg_stat_database_deadlocks');
  });
});
