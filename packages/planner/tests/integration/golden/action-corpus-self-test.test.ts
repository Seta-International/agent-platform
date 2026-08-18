// packages/planner/tests/integration/golden/action-corpus-self-test.test.ts
//
// Corpus integrity (spec §10). No database, no model — this runs on the DEFAULT gate,
// which is the point: the golden lane is opt-in, so without these checks a case can
// go vacuous and nothing notices until someone runs the lane by hand months later.
import { describe, expect, it } from 'vitest';
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
