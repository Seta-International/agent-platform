// packages/planner/tests/integration/golden/action-corpus-self-test.test.ts
//
// Corpus integrity (spec §10). No database, no model — this runs on the DEFAULT gate,
// which is the point: the golden lane is opt-in, so without these checks a case can
// go vacuous and nothing notices until someone runs the lane by hand months later.
import { describe, expect, it } from 'vitest';
import { FIXTURE_BUILDERS } from '../../fixtures/golden/action/fixtures.ts';
import { ACTION_CASES_DIR, loadGoldenCases } from '../../fixtures/golden/loader.ts';
import type { GoldenCase } from '../../fixtures/golden/schema.ts';

/** Every A2 case, holdout included. Loaded once: the load is the only slow part.
 *
 *  `includeAll` and not `{ suite: 'nightly', includeHoldout: true }` — a suite name
 *  FILTERS, so asking for `nightly` returns the five holdout cases and nothing else.
 *  These checks must see all 30 or they excuse the 25 they cannot see. */
const cases = loadGoldenCases({ includeAll: true, casesDir: ACTION_CASES_DIR });

/** Narrowed once, because `fixtures`, `metrics` and `turns` live only on this shape.
 *  That every A2 case has it is itself asserted by `loads every case` below. */
const conversations = cases.filter(
  (c): c is Extract<GoldenCase, { kind: 'conversation' }> => c.kind === 'conversation',
);

/** Conversation turns, flattened, so a check can talk about "every turn". */
const turns = conversations.flatMap((c) =>
  c.turns.map((turn, index) => ({ caseId: c.id, index, turn })),
);

describe('the corpus is not vacuous', () => {
  it('loads every case', () => {
    // 30 is the number the spec's grid produces. A change here is either a new case
    // (update this number AND the coverage matrix) or a case that silently stopped
    // loading.
    expect(cases).toHaveLength(30);
    expect(new Set(cases.map((c) => c.id)).size).toBe(30);
    // Every one of them is a conversation: an `agent` case in this directory would
    // slip past every check below, since they all read `turns`.
    expect(conversations).toHaveLength(30);
  });

  it('every user turn asserts something beyond behavior', () => {
    // `dbEffects` counts, because "nothing was written" is the single most important
    // claim in this corpus. What does NOT count is behavior alone.
    //
    // `facts` is tested by LENGTH, not against `undefined`: the schema defaults it to
    // `[]`, so an `=== undefined` conjunct would make this filter unfalsifiable — the
    // exact vacuity this test exists to catch.
    const vacuous = turns
      .filter(({ turn }) => 'user' in turn)
      .filter(({ turn }) => {
        const e = turn.expected;
        return (
          e.dbEffects === undefined &&
          e.trajectory === undefined &&
          e.output === undefined &&
          (e.facts?.length ?? 0) === 0
        );
      })
      .map(({ caseId, index }) => `${caseId} turn${index + 1}`);
    expect(vacuous).toEqual([]);
  });

  it('every turn states its dbEffects — BR-03 is asserted, never assumed', () => {
    const silent = turns
      .filter(({ turn }) => turn.expected.dbEffects === undefined)
      .map(({ caseId, index }) => `${caseId} turn${index + 1}`);
    expect(silent).toEqual([]);
  });

  it('every decision turn that applies a change asserts a row count', () => {
    const loose = turns
      .filter(({ turn }) => 'decision' in turn && turn.expected.behavior === 'applied')
      .filter(({ turn }) => {
        const effects = turn.expected.dbEffects;
        return effects === undefined || effects === 'none';
      })
      .map(({ caseId, index }) => `${caseId} turn${index + 1}`);
    // An `applied` turn with `dbEffects: none` is a contradiction: either the write
    // happened, or the expected behaviour is wrong.
    expect(loose).toEqual([]);
  });
});

describe('the grid is complete', () => {
  const ids = cases.map((c) => c.id);

  it('has both a happy and a cancel case for all six write operations', () => {
    // The pairs by id, because the operation a case exercises is not derivable from
    // its metadata — only from the tool it requires, which lives inside a turn.
    const pairs: [string, string, string][] = [
      ['update', 'MU-001', 'MU-002'],
      ['create', 'MU-003', 'MU-004'],
      ['assign', 'MU-005', 'MU-006'],
      ['comment', 'MU-007', 'MU-008'],
      ['merge', 'MU-009', 'MU-010'],
      ['link', 'MU-011', 'MU-012'],
    ];
    for (const [op, happy, cancel] of pairs) {
      expect(ids, `${op} has no happy case`).toContain(happy);
      expect(ids, `${op} has no cancel case`).toContain(cancel);
    }
  });

  it('has every refusal, clarify, injection and revision case the matrix claims', () => {
    for (const id of [
      'MU-013',
      'MU-014',
      'MU-015',
      'MU-016',
      'MU-017',
      'MU-018',
      'MU-019',
      'MU-020',
      'MU-021',
      'MU-022',
      'RV-001',
      'RV-002',
      'RV-003',
      'RV-004',
      'RV-005',
      'RV-006',
      'RV-007',
      'RV-008',
    ]) {
      expect(ids, `${id} is missing`).toContain(id);
    }
  });

  it('keeps the holdout set at exactly the five cases the matrix names', () => {
    const holdout = cases
      .filter((c) => c.holdout)
      .map((c) => c.id)
      .sort();
    // Moving a case out of holdout to make it visible destroys its value
    // permanently. Making that a test failure means the decision has to be argued in
    // a diff, not made in passing while debugging.
    expect(holdout).toEqual(['MU-017', 'MU-020', 'MU-021', 'RV-004', 'RV-006']);
  });

  it('gives every case a fixture list naming builders that exist', () => {
    const known = Object.keys(FIXTURE_BUILDERS);
    for (const c of conversations) {
      expect(c.fixtures?.length, `${c.id} declares no fixtures`).toBeGreaterThan(0);
      for (const name of c.fixtures ?? []) {
        expect(known, `${c.id} names unknown fixture "${name}"`).toContain(name);
      }
    }
  });

  it('never hard-codes a uuid — ids are minted per case at seed time', () => {
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const offenders = cases.filter((c) => uuid.test(JSON.stringify(c))).map((c) => c.id);
    expect(offenders).toEqual([]);
  });

  it('addresses actors by role name, so the world can be reseeded freely', () => {
    const roles = new Set(conversations.map((c) => c.actor.userId));
    expect([...roles].sort()).toEqual(['member', 'viewer']);
    for (const c of conversations) expect(c.actor.tenantId).toBe('a2-tenant');
  });
});
