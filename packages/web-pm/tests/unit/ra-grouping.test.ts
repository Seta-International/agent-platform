import { describe, expect, it } from 'vitest';
import {
  compareByField,
  firstInGroupIds,
  groupByPerson,
  personGroupKey,
  personSortKey,
} from '../../src/pages/ra-grouping';

function row(over: Partial<Parameters<typeof groupByPerson>[0][number]> = {}) {
  return {
    allocation_id: 'a1',
    worker_id: 'w1',
    worker_name: 'Alice',
    account_name: 'Acme',
    project_name: 'Apollo',
    planned_pct: 100,
    date_from: '2026-01-01',
    date_to: '2026-06-30',
    bucket: 'billable',
    ...over,
  };
}

describe('personSortKey', () => {
  it('is case-insensitive', () => {
    expect(personSortKey(row({ worker_name: 'Bob' }))).toBe('bob');
  });
  it('sorts unfilled seats (no worker_name) after any named person', () => {
    const named = personSortKey(row({ worker_name: 'zzz person' }));
    const unfilled = personSortKey(row({ worker_name: null, allocation_id: 'a2' }));
    expect(named < unfilled).toBe(true);
  });
  it('keys unfilled seats by allocation id so each is its own singleton', () => {
    const a = personSortKey(row({ worker_name: null, allocation_id: 'a1' }));
    const b = personSortKey(row({ worker_name: null, allocation_id: 'a2' }));
    expect(a).not.toBe(b);
  });
});

describe('personGroupKey', () => {
  it('groups by worker_id when present', () => {
    expect(personGroupKey(row({ worker_id: 'w1', allocation_id: 'a1' }))).toBe(
      personGroupKey(row({ worker_id: 'w1', allocation_id: 'a2' })),
    );
  });
  it('never groups two unfilled seats together', () => {
    const a = personGroupKey(row({ worker_id: null, allocation_id: 'a1' }));
    const b = personGroupKey(row({ worker_id: null, allocation_id: 'a2' }));
    expect(a).not.toBe(b);
  });
});

describe('compareByField', () => {
  it('compares planned_pct numerically', () => {
    expect(
      compareByField('planned', row({ planned_pct: 30 }), row({ planned_pct: 100 }), {}),
    ).toBeLessThan(0);
  });
  it('compares start dates lexicographically (ISO sorts chronologically)', () => {
    expect(
      compareByField(
        'start',
        row({ date_from: '2026-01-01' }),
        row({ date_from: '2026-06-01' }),
        {},
      ),
    ).toBeLessThan(0);
  });
  it('returns 0 for an unknown field', () => {
    expect(compareByField('nonsense', row(), row(), {})).toBe(0);
  });
});

describe('groupByPerson', () => {
  it("keeps one person's rows contiguous even when project names interleave alphabetically", () => {
    const rows = [
      row({ allocation_id: 'z1', worker_name: 'Zed', project_name: 'Aaa' }),
      row({ allocation_id: 'a1', worker_name: 'Alice', project_name: 'Zzz' }),
      row({ allocation_id: 'a2', worker_name: 'Alice', project_name: 'Bbb' }),
    ];
    const sorted = groupByPerson(rows, 'project', false, {});
    expect(sorted.map((r) => r.allocation_id)).toEqual(['a2', 'a1', 'z1']);
  });

  it('sorts within a group ascending by the given field, and flips for desc', () => {
    const rows = [
      row({ allocation_id: 'a1', worker_name: 'Alice', planned_pct: 80 }),
      row({ allocation_id: 'a2', worker_name: 'Alice', planned_pct: 20 }),
    ];
    const asc = groupByPerson(rows, 'planned', false, {});
    expect(asc.map((r) => r.allocation_id)).toEqual(['a2', 'a1']);
    const desc = groupByPerson(rows, 'planned', true, {});
    expect(desc.map((r) => r.allocation_id)).toEqual(['a1', 'a2']);
  });

  it('never lets desc flip the person-group order itself, only the within-group field order', () => {
    const rows = [
      row({ allocation_id: 'z1', worker_name: 'Zed', planned_pct: 50 }),
      row({ allocation_id: 'a1', worker_name: 'Alice', planned_pct: 50 }),
    ];
    const desc = groupByPerson(rows, 'planned', true, {});
    // Alice still comes before Zed even though the field sort direction is desc.
    expect(desc.map((r) => r.allocation_id)).toEqual(['a1', 'z1']);
  });
});

describe('firstInGroupIds', () => {
  it('flags only the first row of each contiguous person group', () => {
    const sorted = [
      row({ allocation_id: 'a1', worker_id: 'w1' }),
      row({ allocation_id: 'a2', worker_id: 'w1' }),
      row({ allocation_id: 'a3', worker_id: 'w2' }),
    ];
    const ids = firstInGroupIds(sorted);
    expect(ids.has('a1')).toBe(true);
    expect(ids.has('a2')).toBe(false);
    expect(ids.has('a3')).toBe(true);
  });

  it('flags every unfilled seat as its own group start', () => {
    const sorted = [
      row({ allocation_id: 'a1', worker_id: null }),
      row({ allocation_id: 'a2', worker_id: null }),
    ];
    const ids = firstInGroupIds(sorted);
    expect(ids.has('a1')).toBe(true);
    expect(ids.has('a2')).toBe(true);
  });
});
