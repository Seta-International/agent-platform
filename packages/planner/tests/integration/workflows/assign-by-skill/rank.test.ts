import { describe, expect, it } from 'vitest';
import { rankCandidates } from '../../../../src/backend/workflows/assign-by-skill/steps/rank-candidates.ts';

const WEIGHTS = { exact: 0.4, vec: 0.25, load: 0.25, tz: 0.1 };

interface CtorOpts {
  id: string;
  exact?: number;
  vector?: number | null;
  history?: number | null;
  open?: number | null;
  tz?: string | null;
}
function c(opts: CtorOpts) {
  return {
    userId: opts.id,
    displayName: opts.id.toUpperCase(),
    skills: [] as string[],
    exactOverlap: opts.exact ?? 0,
    vectorScore: opts.vector ?? null,
    historyScore: opts.history ?? null,
    historyMatches: opts.history != null ? 1 : 0,
    openTaskCount: opts.open ?? null,
    hoursAvailableThisWeek: null,
    timezone: opts.tz ?? null,
  };
}

describe('rankCandidates', () => {
  it('prefers lower load when exact + vector are tied', () => {
    const out = rankCandidates({
      candidates: [
        c({ id: 'a', exact: 2, vector: 0.7, open: 8, tz: 'UTC' }),
        c({ id: 'b', exact: 2, vector: 0.7, open: 2, tz: 'UTC' }),
      ],
      weights: WEIGHTS,
      task: { dueAt: null, tenantTz: 'UTC', priority: 5 },
    });
    expect(out[0]!.userId).toBe('b');
    expect(out[0]!.finalScore).toBeGreaterThan(out[1]!.finalScore);
  });

  it('returns top-5 sorted descending', () => {
    const cands = Array.from({ length: 10 }, (_, i) =>
      c({ id: `u${i}`, exact: 10 - i, vector: 0.5, open: 3, tz: 'UTC' }),
    );
    const out = rankCandidates({
      candidates: cands,
      weights: WEIGHTS,
      task: { dueAt: null, tenantTz: 'UTC', priority: 5 },
    });
    expect(out).toHaveLength(5);
    expect(out.map((x) => x.userId)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4']);
  });

  it('history is a substitute for vector when vector is null', () => {
    const out = rankCandidates({
      candidates: [
        c({ id: 'vec', exact: 0, vector: 0.8, open: 3, tz: 'UTC' }),
        c({ id: 'hist', exact: 0, vector: null, history: 0.8, open: 3, tz: 'UTC' }),
      ],
      weights: WEIGHTS,
      task: { dueAt: null, tenantTz: 'UTC', priority: 5 },
    });
    expect(out[0]!.finalScore).toBeCloseTo(out[1]!.finalScore, 5);
  });

  it('high-priority task amplifies exact-overlap signal', () => {
    const a = c({ id: 'expert', exact: 3, vector: 0.4, open: 3, tz: 'UTC' });
    const b = c({ id: 'fuzzy', exact: 1, vector: 0.9, open: 3, tz: 'UTC' });
    const normal = rankCandidates({
      candidates: [a, b],
      weights: WEIGHTS,
      task: { dueAt: null, tenantTz: 'UTC', priority: 5 },
    });
    const urgent = rankCandidates({
      candidates: [a, b],
      weights: WEIGHTS,
      task: { dueAt: null, tenantTz: 'UTC', priority: 1 },
    });
    const expertGap = (s: typeof normal) =>
      s.find((c_) => c_.userId === 'expert')!.finalScore -
      s.find((c_) => c_.userId === 'fuzzy')!.finalScore;
    expect(expertGap(urgent)).toBeGreaterThan(expertGap(normal));
  });

  it('tight deadline amplifies TZ mismatch penalty', () => {
    const tightDue = new Date(Date.now() + 2 * 86_400_000);
    const farDue = new Date(Date.now() + 60 * 86_400_000);
    const aligned = c({ id: 'aligned', exact: 2, vector: 0.5, open: 3, tz: 'UTC' });
    const opposite = c({ id: 'opposite', exact: 2, vector: 0.5, open: 3, tz: 'Asia/Tokyo' });
    const tight = rankCandidates({
      candidates: [aligned, opposite],
      weights: WEIGHTS,
      task: { dueAt: tightDue, tenantTz: 'UTC', priority: 5 },
    });
    const far = rankCandidates({
      candidates: [aligned, opposite],
      weights: WEIGHTS,
      task: { dueAt: farDue, tenantTz: 'UTC', priority: 5 },
    });
    const tzGap = (s: typeof tight) =>
      s.find((c_) => c_.userId === 'aligned')!.finalScore -
      s.find((c_) => c_.userId === 'opposite')!.finalScore;
    expect(tzGap(tight)).toBeGreaterThan(tzGap(far));
  });

  it('finalScore is normalized into [0,1]', () => {
    const out = rankCandidates({
      candidates: [c({ id: 'top', exact: 5, vector: 1, history: 1, open: 0, tz: 'UTC' })],
      weights: WEIGHTS,
      task: { dueAt: null, tenantTz: 'UTC', priority: 1 },
    });
    expect(out[0]!.finalScore).toBeGreaterThanOrEqual(0);
    expect(out[0]!.finalScore).toBeLessThanOrEqual(1);
  });
});
