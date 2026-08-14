import { describe, expect, it } from 'vitest';
import {
  ActionInputSchema,
  instructionsText,
} from '../../../../src/backend/orchestration/action/orchestrator.ts';

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

  // The bucket is resolved server-side. Without saying so, a model that knows
  // plans have columns asks the user which one — a question the tool has already
  // answered, and whose answer the card shows.
  it('tells the model the tool picks the column itself', () => {
    expect(instructionsText()).toMatch(/first column/i);
    expect(instructionsText()).not.toMatch(/ask[^.]*which bucket/i);
  });

  // A comment is the user's own words on the record. A model that "tidies" them
  // puts words in the user's mouth that they will be seen to have written.
  it("tells the model to post the user's words rather than a summary", () => {
    const text = instructionsText();
    expect(text).toMatch(/comment/i);
    expect(text).toMatch(/do not summarise/i);
  });
});

describe('instructionsText — the REVISION section (FUT-840)', () => {
  const text = instructionsText();

  it('tells the model to call the SAME tool with the SAME task', () => {
    // No approval id is named, because the model is never asked for one: the
    // server decides which preview a turn adjusts (design D20).
    expect(text).toMatch(/same tool/i);
    expect(text).toMatch(/same task/i);
    expect(text).not.toMatch(/revisionOf/);
    expect(text).not.toMatch(/approvalId/);
  });

  it('tells it to send only the newly named fields', () => {
    expect(text).toMatch(/only the fields/i);
  });

  it('names correction as the way to NARROW the proposal rather than add to it', () => {
    expect(text).toMatch(/correction: true/);
    expect(text).toMatch(/narrowing/i);
    expect(text).toMatch(/adding/i);
  });

  it('names dropFields as the way to leave a field alone', () => {
    expect(text).toMatch(/dropFields/);
  });

  it('tells it NOT to revise when the user asks for a different KIND of change (design D4)', () => {
    expect(text).toMatch(/different kind of change/i);
    expect(text).toMatch(/confirm or cancel/i);
  });

  it('tells it to NAME THE TASK in the confirmation sentence (design D19)', () => {
    // The newest preview is a database fact, not UI focus — a user scrolled to an
    // older card can be mis-targeted, and naming the task makes that visible in
    // the same breath.
    expect(text).toMatch(/name the task/i);
  });

  it('tells it to quote the dates the tool returns rather than deriving them', () => {
    // Production wrote "Thứ Hai, 15/08/2026" for a Saturday. Copying a rendered
    // date is something a small model does reliably; deriving a weekday is not.
    expect(text).toMatch(/quote the dates/i);
  });
});

describe('the OPEN PREVIEW block survives the run input (FUT-840)', () => {
  // buildAction is private and the plan forbids exporting it for a test, and this
  // suite has no fake-model seam to record the assembled prompt. The two halves
  // of "the block reaches the model" are therefore pinned separately: the block's
  // own text in open-preview-block.test.ts, and the input carrying it here.
  // Their JOIN — that buildAction concatenates them — is Tier 5 golden-lane work.
  const openPreview = {
    approvalId: '7f3a1c2e-1111-4222-8333-444455556666',
    toolId: 'planner_updateTask',
    intent: 'Update "Deploy API"',
    taskIds: ['66be2be2-394d-4184-b106-c412289fd1e1'],
    proposedRows: [{ k: 'Due', v: '12 Aug → 15 Aug' }],
  };

  it('ActionInputSchema keeps openPreview verbatim rather than stripping it', () => {
    const parsed = ActionInputSchema.parse({
      userText: 'make it next Friday',
      taskId: null,
      openPreview,
    });
    expect(parsed.openPreview).toEqual(openPreview);
  });

  it('accepts a turn with nothing open', () => {
    const parsed = ActionInputSchema.parse({
      userText: 'make it next Friday',
      taskId: null,
      openPreview: null,
    });
    expect(parsed.openPreview).toBeNull();
  });
});
