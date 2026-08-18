import { expect, it } from 'vitest';
import {
  ACTION_REFERENCE_TIME,
  ACTION_TASK_SCOPED_TABLES,
} from '../../../fixtures/golden/action/constants.ts';

it('freezes the A2 clock on a Wednesday, so weekday phrases have one reading', () => {
  // 2026-08-12 is a Wednesday in Asia/Bangkok. Cases say "thứ Sáu tuần sau"
  // (= 2026-08-21) and "ngày mai" (= 2026-08-13); both are unambiguous only
  // because today is mid-week. Said on a Friday, "thứ Sáu tuần sau" is the phrase
  // A2's own prompt calls ambiguous.
  const bkk = new Date(ACTION_REFERENCE_TIME.getTime() + 7 * 60 * 60 * 1000);
  expect(bkk.getUTCDay()).toBe(3);
  expect(ACTION_REFERENCE_TIME.toISOString()).toBe('2026-08-12T02:00:00.000Z');
});

it('lists task-scoped tables children-first so a delete cannot hit an FK', () => {
  expect(ACTION_TASK_SCOPED_TABLES[ACTION_TASK_SCOPED_TABLES.length - 1]).toBe('planner.tasks');
  expect(ACTION_TASK_SCOPED_TABLES).toContain('planner.task_references');
});
