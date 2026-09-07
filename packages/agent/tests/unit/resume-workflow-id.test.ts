import type { ApprovalCard } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import {
  ASSIGNMENT_ORCHESTRATOR_WORKFLOW_ID,
  resumeWorkflowIdForCard,
} from '../../src/backend/domain/write-chat-approval-row.ts';

function card(meta: Partial<ApprovalCard['meta']>): ApprovalCard {
  return {
    toolCallId: 'tc1',
    intent: 'test',
    riskBadge: 'write',
    summary: 's',
    details: [],
    primary: { label: 'Do it', argsPatch: {} },
    alternates: [],
    decline: { label: 'Cancel', argsPatch: {} },
    meta: {
      tenantId: 't1',
      userId: 'u1',
      agentPath: ['x'],
      toolId: 'planner_linkTasks',
      ts: new Date().toISOString(),
      ...meta,
    },
  };
}

describe('resumeWorkflowIdForCard', () => {
  // The card names its own runtime. Before FUT-820 this was a hardcoded equality
  // on ONE tool id in the chat route, so every action tool added after
  // planner_updateTask silently got the assignment contract and its Confirm 400'd.
  it('uses the runtime the card declares', () => {
    expect(resumeWorkflowIdForCard(card({ workflowId: 'planner.action' }))).toBe('planner.action');
  });

  // The agent tier may not import feature modules, so it cannot know every tool.
  // A card that declares nothing keeps the legacy behaviour rather than guessing.
  it('falls back to the assignment orchestrator when the card declares nothing', () => {
    expect(resumeWorkflowIdForCard(card({}))).toBe(ASSIGNMENT_ORCHESTRATOR_WORKFLOW_ID);
  });
});
