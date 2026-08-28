import { describe, expect, it } from 'vitest';
import { kpiExplorerQuery } from '../../src/contracts.ts';

const query = (account_ids?: string) => ({
  iso_year: '2026',
  iso_week: '32',
  ...(account_ids === undefined ? {} : { account_ids }),
});

describe('kpiExplorerQuery — account_ids', () => {
  it('reads a comma-separated list into one id per account', () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    const parsed = kpiExplorerQuery.safeParse(query(`${a},${b}`));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.account_ids).toEqual([a, b]);
  });

  it('reads a single id, the shape a one-account filter still sends', () => {
    const a = crypto.randomUUID();
    const parsed = kpiExplorerQuery.safeParse(query(a));
    expect(parsed.success && parsed.data.account_ids).toEqual([a]);
  });

  it('treats an absent or empty filter as every account', () => {
    const absent = kpiExplorerQuery.safeParse(query());
    expect(absent.success).toBe(true);
    expect(absent.success && absent.data.account_ids).toBeUndefined();

    const blank = kpiExplorerQuery.safeParse(query(''));
    expect(blank.success).toBe(true);
    expect(blank.success && blank.data.account_ids).toBeUndefined();
  });

  it('rejects a list carrying anything that is not an account id', () => {
    const a = crypto.randomUUID();
    expect(kpiExplorerQuery.safeParse(query(`${a},not-an-id`)).success).toBe(false);
    expect(kpiExplorerQuery.safeParse(query('not-an-id')).success).toBe(false);
  });
});
