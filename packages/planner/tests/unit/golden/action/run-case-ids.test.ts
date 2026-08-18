// `fixtures.<name>` resolution, on its own.
//
// Part 3 resolved those references only inside `dbEffects.after`. A case that asserts
// `taskRefs` equals the fixture's task needs the same resolution on the TRAJECTORY
// side, and one resolver has to serve both or the two drift.
import { expect, it } from 'vitest';
import { resolveFixtureRefs } from '../../../fixtures/golden/action/run-case.ts';

const TASK = '11111111-2222-4333-8444-555555555555';

it('resolves fixtures.* inside an argPredicate value, including inside an array', () => {
  const resolved = resolveFixtureRefs(
    [
      {
        tool: 'planner_updateTask',
        path: 'taskRefs',
        operator: 'equals',
        value: ['fixtures.task'],
      },
    ],
    { task: TASK },
  );
  expect(resolved).toEqual([
    { tool: 'planner_updateTask', path: 'taskRefs', operator: 'equals', value: [TASK] },
  ]);
});

it('leaves ordinary strings and dates untouched', () => {
  expect(resolveFixtureRefs({ value: '2026-08-19' }, { task: TASK })).toEqual({
    value: '2026-08-19',
  });
});

it('throws on a reference no builder produced', () => {
  expect(() => resolveFixtureRefs({ value: 'fixtures.nope' }, {})).toThrow(/unknown fixture id/);
});
