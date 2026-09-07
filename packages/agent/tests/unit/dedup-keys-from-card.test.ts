import type { ApprovalCard } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { dedupKeysFromCard } from '../../src/backend/domain/write-chat-approval-row.ts';

function card(meta: Partial<ApprovalCard['meta']>): ApprovalCard {
  return {
    toolCallId: 'tc-1',
    intent: 'Assign "AWS migration"',
    riskBadge: 'write',
    summary: 'Tuan will be the only assignee.',
    details: [],
    primary: { label: 'Assign', argsPatch: {} },
    alternates: [],
    decline: { label: 'Cancel' },
    meta: {
      tenantId: 't1',
      userId: 'u1',
      agentPath: ['action'],
      toolId: 'planner_assignTask',
      ts: '2026-08-13T00:00:00.000Z',
      ...meta,
    },
  };
}

describe('dedupKeysFromCard — one release of tolerant reads (spec §3.2)', () => {
  it('returns the plural array when the card declares one', () => {
    expect(dedupKeysFromCard(card({ dedupKeys: ['assign:a', 'task:a'] }))).toEqual([
      'assign:a',
      'task:a',
    ]);
  });

  it('lifts a legacy singular dedupKey into a one-element array', () => {
    expect(dedupKeysFromCard(card({ dedupKey: 'assign:a' }))).toEqual(['assign:a']);
  });

  it('prefers the plural array when a card somehow carries both', () => {
    expect(dedupKeysFromCard(card({ dedupKeys: ['task:a'], dedupKey: 'assign:a' }))).toEqual([
      'task:a',
    ]);
  });

  it('returns an empty array for a card that declares no mutex', () => {
    expect(dedupKeysFromCard(card({}))).toEqual([]);
  });

  it('treats an empty plural array as "no mutex", not as a reason to fall back', () => {
    expect(dedupKeysFromCard(card({ dedupKeys: [], dedupKey: 'assign:a' }))).toEqual(['assign:a']);
  });
});
