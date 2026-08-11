import { describe, expect, it } from 'vitest';
import { instructionsText } from '../../../../src/backend/orchestration/action/orchestrator.ts';

describe('A2 instructions', () => {
  it('no longer claims it cannot change several tasks at once', () => {
    expect(instructionsText()).not.toMatch(/change several tasks at once/i);
  });

  it('states the 20-task cap and forbids splitting a larger request', () => {
    const text = instructionsText();
    expect(text).toMatch(/20 tasks/);
    expect(text).toMatch(/never split/i);
  });

  // The conversation only remembers 10 recent tasks, but a batch may be 20, so
  // ordinals physically cannot address the back half. The prompt has to say that
  // out loud or the model will confidently pass "#14".
  it('tells the model to pass taskIds, not ordinals, for a large batch', () => {
    const text = instructionsText();
    expect(text).toMatch(/taskId/);
    expect(text).toMatch(/last 10|10 tasks/i);
  });

  // "create tasks" was on this list until FUT-821 shipped planner_createTask.
  // Permanent deletion is the one that stays: A2 has no purge tool at all.
  it('still refuses the things A2 genuinely cannot do', () => {
    expect(instructionsText()).toMatch(/permanently delete/i);
  });
});

describe('A2 instructions — linking', () => {
  it('no longer claims it cannot link tasks', () => {
    expect(instructionsText()).not.toMatch(/cannot[^.]*link tasks/i);
  });

  it('explains the direction of duplicates and blocks', () => {
    const text = instructionsText();
    expect(text).toMatch(/duplicates/i);
    expect(text).toMatch(/blocks/i);
  });
});

describe('A2 instructions — merging', () => {
  it('no longer claims it cannot merge tasks', () => {
    expect(instructionsText()).not.toMatch(/cannot[^.]*merge tasks/i);
  });

  it('tells the model which side of a merge gets trashed', () => {
    expect(instructionsText()).toMatch(/duplicateTaskRef/);
    expect(instructionsText()).toMatch(/trash/i);
  });

  // Both halves of this assertion have now been reversed by later stories —
  // assigning by FUT-822, creating by FUT-821 — so what is left to pin is that
  // the merge guidance still names the tool it offers instead of deleting.
  it('offers merge as the answer to a task the user wants gone', () => {
    expect(instructionsText()).toMatch(/planner_mergeTasks/);
  });
});

describe('A2 instructions — assigning', () => {
  it('no longer claims it cannot change who a task is assigned to', () => {
    expect(instructionsText()).not.toMatch(/cannot[^.]*assigned/i);
  });

  it('states that assigning replaces the whole set', () => {
    expect(instructionsText()).toMatch(/replaces/i);
  });

  // The rule that prevents silent data loss on "thay B bằng A".
  it('tells the model to read the task first for a relative request', () => {
    const text = instructionsText();
    expect(text).toMatch(/planner_getTask FIRST/i);
    expect(text).toMatch(/thay B bằng A|giao thêm/i);
  });

  // D10 in the prompt, so a misroute degrades to a sentence rather than a guess.
  it('tells the model to offer a recommendation when nobody is named', () => {
    expect(instructionsText()).toMatch(/recommendation/i);
  });

  it('no longer claims it cannot create tasks', () => {
    expect(instructionsText()).not.toMatch(/cannot[^.]*create/i);
  });

  it('tells the model to ask for the plan rather than guess one', () => {
    const text = instructionsText();
    expect(text).toMatch(/plan/i);
    expect(text).toMatch(/never guess a plan/i);
  });

  // Duplicate detection is the tool's job; a model that searches first spends two
  // calls and still shows one card.
  it('tells the model not to search for duplicates itself', () => {
    expect(instructionsText()).toMatch(/do not search for duplicates/i);
  });
});
