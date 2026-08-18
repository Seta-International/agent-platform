// packages/planner/tests/fixtures/golden/action/constants.ts
//
// The A2 (action) corpus's frozen anchors.
//
// ZERO DEPENDENCIES ON PURPOSE. `src/backend/orchestration/eval-target.ts`
// imports ACTION_REFERENCE_TIME so the case data and the eval-executed agent
// share one clock; importing anything here would pull the fixture graph
// (pg, seeds, identity) into a production module. Same rule as A1's
// tests/fixtures/golden/constants.ts.

/**
 * Wednesday 2026-08-12, 09:00 Asia/Bangkok.
 *
 * Mid-week on purpose. "thứ Sáu tuần sau" said on a Wednesday resolves to
 * 2026-08-21 and to nothing else. The revision cases quote 15/08 and 19/08, which
 * sit on either side of a week boundary from here — the same shape as the
 * production turn on 14/08 that FUT-840 was written for.
 */
export const ACTION_REFERENCE_TIME = new Date('2026-08-12T09:00:00+07:00');

/** The absolute dates the cases use, derived once so a case file and an assertion
 *  can never disagree about what a relative phrase meant. */
export const D_TOMORROW = '2026-08-13';
export const D_THIS_FRIDAY = '2026-08-14';
export const D_AUG_15 = '2026-08-15';
export const D_AUG_19 = '2026-08-19';
export const D_NEXT_FRIDAY = '2026-08-21';

/**
 * Every table the corpus may write, children first.
 *
 * Read by BOTH `resetActionWorld` and the row snapshot, so the reset and the
 * measurement can never drift apart — a table added to one and not the other
 * would make "nothing was written" mean "nothing was written where we looked".
 */
export const ACTION_TASK_SCOPED_TABLES = [
  'planner.task_references',
  'planner.task_comments',
  'planner.task_labels',
  'planner.task_assignments',
  'planner.checklist_items',
  'planner.tasks',
] as const;
