import { describe, expect, it } from 'vitest';
import type { PerformanceCapacity } from '../../src/api/people-client.ts';
import { performanceScopeKey } from '../../src/api/performance-query.ts';
import {
  decodeCapacity,
  encodeCapacity,
  entitledSections,
  PERFORMANCE_SECTIONS,
  resolveScope,
} from '../../src/lib/performance-scope.ts';

const TL_A: PerformanceCapacity = {
  kind: 'tl',
  project_id: 'proj-a',
  account_id: 'acc',
  label: 'Alpha',
};
const MEMBER_B: PerformanceCapacity = {
  kind: 'member',
  project_id: 'proj-b',
  account_id: 'acc',
  label: 'Beta',
};
const AM_X: PerformanceCapacity = { kind: 'am', account_id: 'acc-x', label: 'Xen' };

function ctx(capacities: PerformanceCapacity[], role_slugs: string[] = []) {
  return {
    capacities,
    role_slugs,
    default_capacity_index: capacities.length ? 0 : -1,
    as_of_month: '2026-07',
  };
}

describe('capacity codec', () => {
  it('round-trips every kind', () => {
    expect(decodeCapacity(encodeCapacity({ kind: 'tl', project_id: 'p1' }))).toEqual({
      kind: 'tl',
      project_id: 'p1',
    });
    expect(decodeCapacity(encodeCapacity({ kind: 'member', project_id: 'p2' }))).toEqual({
      kind: 'member',
      project_id: 'p2',
    });
    expect(decodeCapacity(encodeCapacity({ kind: 'am', account_id: 'a1' }))).toEqual({
      kind: 'am',
      account_id: 'a1',
    });
  });

  it('rejects garbage', () => {
    expect(decodeCapacity(undefined)).toBeNull();
    expect(decodeCapacity('')).toBeNull();
    expect(decodeCapacity('x:1')).toBeNull();
    expect(decodeCapacity('tl:')).toBeNull();
  });
});

describe('resolveScope', () => {
  it('prefers a valid URL capacity (AC3/AC4)', () => {
    const scope = resolveScope({ capacity: 'member:proj-b' }, ctx([TL_A, MEMBER_B]));
    expect(scope).toEqual({
      capacity: { kind: 'member', project_id: 'proj-b' },
      as_of_month: '2026-07',
    });
  });

  it('falls back to the deterministic default on missing or unentitled capacity', () => {
    expect(resolveScope({}, ctx([TL_A, MEMBER_B]))?.capacity).toEqual({
      kind: 'tl',
      project_id: 'proj-a',
    });
    expect(resolveScope({ capacity: 'tl:someone-elses' }, ctx([TL_A, MEMBER_B]))?.capacity).toEqual(
      {
        kind: 'tl',
        project_id: 'proj-a',
      },
    );
  });

  it('returns null when the user has no capacities', () => {
    expect(resolveScope({}, ctx([]))).toBeNull();
  });

  it('honours a month override in the URL', () => {
    expect(resolveScope({ month: '2026-07' }, ctx([TL_A]))?.as_of_month).toBe('2026-07');
  });
});

describe('entitledSections (AC1)', () => {
  it('member capacity only: no scoring, configuration, or audit', () => {
    const s = entitledSections(ctx([MEMBER_B]));
    expect(s.has('dashboard')).toBe(true);
    expect(s.has('self-assessment')).toBe(true);
    expect(s.has('scoring')).toBe(false);
    expect(s.has('configuration')).toBe(false);
    expect(s.has('audit')).toBe(false);
  });

  it('PMO role only (org-wide read, no scoring in MVP)', () => {
    const s = entitledSections(ctx([], ['pm.pmo']));
    expect(s.has('dashboard')).toBe(true);
    expect(s.has('audit')).toBe(true);
    expect(s.has('history')).toBe(true);
    expect(s.has('scoring')).toBe(false);
    expect(s.has('self-assessment')).toBe(false);
  });

  it('unions capacities and roles (TL + HR manager)', () => {
    const s = entitledSections({ capacities: [TL_A], role_slugs: ['people.manager'] });
    expect(s.has('scoring')).toBe(true);
    expect(s.has('configuration')).toBe(true);
    expect(s.has('audit')).toBe(true);
  });

  it('every entitled section is a known section slug', () => {
    const s = entitledSections({
      capacities: [TL_A, AM_X],
      role_slugs: ['pm.bod', 'people.manager'],
    });
    for (const slug of s) expect(PERFORMANCE_SECTIONS).toContain(slug);
  });
});

describe('performanceScopeKey (AC2 — cache never merges across capacities)', () => {
  it('differs across capacity kind, id, and month', () => {
    const k1 = performanceScopeKey({
      capacity: { kind: 'tl', project_id: 'proj-a' },
      as_of_month: '2026-07',
    });
    const k2 = performanceScopeKey({
      capacity: { kind: 'member', project_id: 'proj-b' },
      as_of_month: '2026-07',
    });
    const k3 = performanceScopeKey({
      capacity: { kind: 'tl', project_id: 'proj-a' },
      as_of_month: '2026-06',
    });
    expect(k1).not.toEqual(k2);
    expect(k1).not.toEqual(k3);
    expect(k1).toEqual(
      performanceScopeKey({
        capacity: { kind: 'tl', project_id: 'proj-a' },
        as_of_month: '2026-07',
      }),
    );
  });
});
