import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import { candidateEvent, candidateSkill, reason } from '../../src/backend/db/schema.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function tableCols(pool: import('pg').Pool, table: string): Promise<Set<string>> {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='hiring' AND table_name=$1`,
    [table],
  );
  return new Set(r.rows.map((x) => x.column_name));
}

describe('hir6/7 schema shape', () => {
  it('exposes the new candidate tables', () => {
    expect(candidateSkill).toBeDefined();
    expect(reason).toBeDefined();
    expect(candidateEvent).toBeDefined();
  });
});

describe('hiring schema shape (HIR-2)', () => {
  it('has the reshaped requisition + 5 new tables after migrate', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const reqCols = await tableCols(pool, 'requisition');
        expect(reqCols.has('start_date')).toBe(true);
        expect(reqCols.has('note')).toBe(true);
        expect(reqCols.has('default_interview_mode')).toBe(true);
        expect(reqCols.has('jd')).toBe(false); // removed → requisition_jd_section
        expect(reqCols.has('resource_request_id')).toBe(false); // moved → opening
        expect(reqCols.has('position_id')).toBe(false); // moved → opening

        for (const t of [
          'opening',
          'requisition_jd_section',
          'requisition_skill',
          'reason',
          'jd_template',
          'jd_template_section',
        ]) {
          expect((await tableCols(pool, t)).size).toBeGreaterThan(0);
        }
        const openingCols = await tableCols(pool, 'opening');
        for (const c of [
          'seq',
          'status',
          'close_reason_id',
          'hired_application_id',
          'resource_request_id',
          'position_id',
          'version',
        ]) {
          expect(openingCols.has(c)).toBe(true);
        }
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
