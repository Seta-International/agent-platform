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
  // Only present when a preview is open: 29 lines of adjustment law is noise on
  // the ~95% of turns with nothing on screen, and salience beats completeness for
  // a 9B model.
  const text = instructionsText({ hasOpenPreview: true });

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

// ───────────────────────────────────────────────────────────────────────────────
// The four rules the 14/08 conversation proved were missing. A2 read the OPEN
// PREVIEW block correctly and then, across four turns, emitted text and called
// NOTHING — so `resolveRevision` never ran and no second card could exist. Part 4
// fixed the tier below this one; these pin the tier that actually failed.
// ───────────────────────────────────────────────────────────────────────────────
describe('instructionsText — why the 14/08 conversation looped (FUT-840)', () => {
  const text = instructionsText({ hasOpenPreview: true });

  // The model said it out loud: "Vì đây là một yêu cầu mới (thay đổi 19/08 thay vì
  // 15/08)". It read a different VALUE as a different KIND, which the old wording
  // left open, and then declined to act on what it had classified as new.
  it('says a new value for a field already in the preview IS an adjustment', () => {
    expect(text).toMatch(/new value/i);
    expect(text).toMatch(/19\/08/);
    expect(text).toMatch(/not a new request/i);
  });

  // "different kind" now has one definition, and it is the same one the server
  // decides by: `open.toolId !== opts.toolId` in revision.ts.
  it('defines a different KIND of change as a different TOOL', () => {
    expect(text).toMatch(/different kind of change means a different tool/i);
  });

  // The loop's engine. A2 asked "Bạn có xác nhận đổi ngày ... không?" instead of
  // calling the tool; prose changes no state, so the user's "đúng" re-entered an
  // identical turn and produced the identical question. Three times.
  it('forbids asking for confirmation in words before calling the tool', () => {
    expect(text).toMatch(/never ask for confirmation in words/i);
    expect(text).toMatch(/the card is how the user confirms/i);
  });

  // It invented a protocol that does not exist: "tôi cần hủy đề xuất cũ và tạo một
  // đề xuất mới". There is no cancel tool, and supersede is atomic in the writer.
  it('forbids claiming it will cancel or replace a proposal', () => {
    expect(text).toMatch(/never say you will cancel or replace/i);
  });

  // With a card on screen, a bare "đúng" is the user approving THAT card. Nothing
  // in the prompt said so, so the model treated it as an answer to its own
  // question and asked again.
  it('tells it a bare agreement means press Confirm on the card', () => {
    expect(text).toMatch(/press confirm/i);
    expect(text).toMatch(/do not ask again/i);
  });
});

describe('instructionsText — the ADJUSTING section is conditional', () => {
  it('is absent when no preview is open', () => {
    expect(instructionsText()).not.toMatch(/ADJUSTING A PREVIEW/);
  });

  it('is present when one is', () => {
    expect(instructionsText({ hasOpenPreview: true })).toMatch(/ADJUSTING A PREVIEW/);
  });

  // The lookup degrades to null on a read-model hiccup (route-chat.ts), and then
  // no OPEN PREVIEW block is injected either — so omitting the rules keeps the
  // prompt consistent with the data instead of describing a block that is absent.
  it('keeps every non-revision rule in both shapes', () => {
    for (const text of [instructionsText(), instructionsText({ hasOpenPreview: true })]) {
      expect(text).toMatch(/planner_mergeTasks/);
      expect(text).toMatch(/20 tasks/);
      expect(text).toMatch(/permanently delete/i);
    }
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
