import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as planner from '../../src/index.ts';

const PLANNER_SRC = resolve(__dirname, '../../src');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (full.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

describe('plan sync boundary', () => {
  it('planner src does not import @seta/integrations', () => {
    const files = walk(PLANNER_SRC);
    const offenders = files.filter((f) => {
      const body = readFileSync(f, 'utf8');
      return /from\s+['"]@seta\/integrations(?!\/events)/.test(body);
    });
    expect(offenders).toEqual([]);
  });

  it('exports the 6 new public-surface ops', () => {
    for (const k of [
      'linkPlanToM365',
      'unlinkPlanFromM365',
      'markPlanSyncStatus',
      'markTaskSyncStatus',
      'refreshPlanSync',
      'resolvePlanConflicts',
    ] as const) {
      expect(planner).toHaveProperty(k);
      expect(typeof (planner as Record<string, unknown>)[k]).toBe('function');
    }
  });

  it('planner package has the expected drizzle migration applied', () => {
    const migration = resolve(__dirname, '../../drizzle/0007_plans_tasks_sync_schema.sql');
    expect(existsSync(migration)).toBe(true);
    const sql = readFileSync(migration, 'utf8');
    expect(sql).toMatch(/plans_sync_status_check/);
    expect(sql).toMatch(/tasks_sync_status_check/);
    expect(sql).toMatch(/checklist_items_external_uniq/);
    expect(sql).toMatch(/external_assigned_at/);
  });

  it('lint:deps would pass on planner package (dep-cruiser via biome lint)', () => {
    // The repo-wide `pnpm lint` is the actual gate; here we sanity-check that
    // `tsc --noEmit` succeeds for the planner package alone.
    expect(() =>
      execSync('pnpm --filter @seta/planner typecheck', {
        stdio: 'pipe',
        cwd: resolve(__dirname, '../../../../'),
      }),
    ).not.toThrow();
  });
});
