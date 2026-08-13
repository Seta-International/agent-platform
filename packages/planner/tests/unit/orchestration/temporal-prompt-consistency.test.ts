import { TEMPORAL_CONTEXT_MARKER, temporalContextBlock } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { buildInstructions as buildTaskSearchInstructions } from '../../../src/backend/orchestration/agents/task-search.ts';
import { buildInstructions as buildTeamInfoInstructions } from '../../../src/backend/orchestration/agents/team-info.ts';

// 00:30 ICT on 2026-07-30 — the window where UTC math reported yesterday.
const EARLY_MORNING = new Date('2026-07-29T17:30:00Z');
const EXPECTED_TODAY = 'today       = 2026-07-30';

describe('FUT-800 AC4 — early-morning ICT in rendered prompts', () => {
  it('task-search states the local date, not the UTC one', () => {
    const text = buildTaskSearchInstructions(EARLY_MORNING);
    expect(text).toContain(EXPECTED_TODAY);
    expect(text).not.toContain('today       = 2026-07-29');
  });

  it('team-info honours the injected clock instead of the wall clock', () => {
    // Regression for team-info calling the block with no argument (pre-FUT-800).
    const text = buildTeamInfoInstructions(EARLY_MORNING);
    expect(text).toContain(EXPECTED_TODAY);
  });
});

describe('FUT-800 AC1/AC2 — every routing branch sees the same date', () => {
  it('renders one identical temporal block for a given instant', () => {
    // The intent classifier routes to three different orchestrators
    // (planner_qna / assignment / weekly_planner). Because every branch renders
    // the block from the same function and instant, "which tasks are overdue?"
    // and "list my overdue tasks" cannot disagree about today — which is what
    // made the bug look random.
    const block = temporalContextBlock(EARLY_MORNING);
    expect(buildTaskSearchInstructions(EARLY_MORNING)).toContain(block);
    expect(buildTeamInfoInstructions(EARLY_MORNING)).toContain(block);
  });

  it('marks the block so the CI gate can find it', () => {
    expect(buildTaskSearchInstructions(EARLY_MORNING)).toContain(TEMPORAL_CONTEXT_MARKER);
  });
});
