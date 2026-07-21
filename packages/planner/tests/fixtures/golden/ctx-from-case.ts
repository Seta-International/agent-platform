// packages/planner/tests/fixtures/golden/ctx-from-case.ts
//
// Maps a validated agent GoldenCase + the captured trajectory + the run's answer
// into the PolicyEvalContext the deterministic scorers consume. Pure.
import type { PolicyEvalContext } from './policy/registry.ts';
import type { Trajectory } from './policy/trajectory.ts';
import type { GoldenCase } from './schema.ts';

/** Deterministic (no LLM) observed-behavior classifier from the answer text. */
function deriveObservedBehavior(answer: string): string {
  const a = answer.trim();
  if (a.length === 0) return 'empty';
  const lower = a.toLowerCase();
  if (/\b(cannot|can't|not able|won'?t|refuse|read-only)\b/.test(lower)) return 'refuse';
  if (/\b(which|clarify|did you mean|more than one|ambiguous)\b/.test(lower) && a.includes('?'))
    return 'clarify';
  return 'answer';
}

export function ctxFromCase(
  c: GoldenCase,
  trajectory: Trajectory,
  answer: string,
): PolicyEvalContext {
  if (c.kind !== 'agent' && c.kind !== 'conversation') {
    throw new Error(`ctxFromCase: unsupported kind "${c.kind}"`);
  }
  const expected = c.kind === 'agent' ? c.expected : c.turns[c.turns.length - 1]!.expected;
  const t = expected.trajectory ?? {};
  const constraints = {
    requiredTools: t.requiredTools ?? [],
    allowedTools: t.allowedTools ?? [],
    forbiddenTools: t.forbiddenTools ?? [],
    requiredPartialOrder: t.requiredPartialOrder ?? [],
    argPredicates: t.argPredicates ?? [],
    maxToolCalls: t.maxToolCalls,
  };
  return {
    trajectory,
    constraints,
    observedBehavior: deriveObservedBehavior(answer),
    expectedBehaviorValue: expected.behavior,
    answer,
    expectedDelegationTool: constraints.requiredTools[0],
    forbiddenEntities: expected.output?.forbiddenEntities ?? [],
    forbiddenText: expected.output?.forbiddenText ?? [],
  };
}
