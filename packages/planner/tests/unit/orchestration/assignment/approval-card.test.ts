import { ApprovalCardSchema } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { buildAssignApprovalCard } from '../../../../src/backend/orchestration/assignment/approval-card.ts';
import type { Recommendation } from '../../../../src/backend/orchestration/assignment/schemas.ts';

const REC = (over: Partial<Recommendation> = {}): Recommendation => ({
  userId: 'u1',
  name: 'Alice',
  skillMatch: ['aws', 'docker'],
  skillMatchCount: 2,
  status: 'available',
  availabilityScore: 0.9,
  relevanceScore: 1,
  score: 0.93,
  ...over,
});

describe('buildAssignApprovalCard', () => {
  it('maps the top recommendation to primary and the rest to alternates', () => {
    const card = buildAssignApprovalCard({
      taskId: 't-1',
      title: 'AWS migration',
      recommendations: [
        REC(),
        REC({ userId: 'u2', name: 'Bob', availabilityScore: 0.4, status: 'busy' }),
      ],
      tenantId: 'tn1',
      userId: 'actor1',
      idempotencyKey: 'key-1',
    });
    expect(card.intent).toBe('Assign "AWS migration"');
    expect(card.riskBadge).toBe('write');
    expect(card.primary).toEqual({
      label: 'Assign to Alice',
      argsPatch: {
        action: 'assign',
        assigneeUserIds: ['u1'],
        taskId: 't-1',
        idempotencyKey: 'key-1',
      },
    });
    expect(card.alternates).toEqual([
      {
        label: 'Assign to Bob',
        argsPatch: {
          action: 'assign',
          assigneeUserIds: ['u2'],
          taskId: 't-1',
          idempotencyKey: 'key-1',
        },
      },
    ]);
    expect(card.decline.label).toBe('Leave unassigned');
    // toolId routes the decision to the existing planner decider/mutex/supersede.
    expect(card.meta.toolId).toBe('planner_proposeAssignment');
    expect(card.meta.tenantId).toBe('tn1');
    expect(card.meta.userId).toBe('actor1');
  });

  it('renders candidates with skills, status, and the blended score; null title falls back to the taskId', () => {
    const card = buildAssignApprovalCard({
      taskId: 't-1',
      title: null,
      recommendations: [REC()],
      tenantId: 'tn1',
      userId: 'actor1',
      idempotencyKey: 'key-1',
    });
    expect(card.intent).toBe('Assign "t-1"');
    expect(card.details).toEqual([
      {
        kind: 'entityList',
        select: 'single',
        items: [
          {
            id: 'u1',
            type: 'user',
            label: 'Alice',
            secondary: 'skills: aws, docker · available',
            score: 0.93,
            primary: true,
          },
        ],
      },
      { kind: 'confidence', score: 0.93 },
    ]);
  });

  it('labels a nameless candidate by userId', () => {
    const card = buildAssignApprovalCard({
      taskId: 't-1',
      title: null,
      recommendations: [REC({ name: null })],
      tenantId: 'tn1',
      userId: 'actor1',
      idempotencyKey: 'key-1',
    });
    expect(card.primary.label).toBe('Assign to u1');
    expect(card.details[0]).toMatchObject({ items: [{ label: 'u1' }] });
  });

  it('parses against the SDK ApprovalCardSchema', () => {
    const card = buildAssignApprovalCard({
      taskId: 't-1',
      title: 'AWS migration',
      recommendations: [REC()],
      tenantId: 'tn1',
      userId: 'actor1',
      idempotencyKey: 'key-1',
    });
    expect(() => ApprovalCardSchema.parse(card)).not.toThrow();
  });

  it('throws on empty recommendations', () => {
    expect(() =>
      buildAssignApprovalCard({
        taskId: 't-1',
        title: null,
        recommendations: [],
        tenantId: 'tn1',
        userId: 'actor1',
        idempotencyKey: 'key-1',
      }),
    ).toThrow();
  });
});

describe('buildAssignApprovalCard — the one-proposal-per-task declaration', () => {
  const base = {
    taskId: 'task-1',
    title: 'AWS migration',
    tenantId: 't1',
    userId: 'u0',
    idempotencyKey: 'key-1',
    recommendations: [
      REC({ userId: 'u1', name: 'Alice', score: 0.9 }),
      REC({ userId: 'u2', name: 'Bob', score: 0.7 }),
    ],
  };

  // D7: the mutex is a string two modules agree on, not a workflow id the agent
  // tier hardcodes. This assertion IS the contract — if the format changes here
  // it must change in write-chat-approval-row.ts and the subscriber too.
  it('declares dedupKey = assign:<taskId>', () => {
    expect(buildAssignApprovalCard(base).meta.dedupKey).toBe('assign:task-1');
  });

  // The decline branch becomes a resume payload in plan 02, and that payload has
  // to name the task like every other branch does.
  it('carries taskId on the decline branch as well as on primary', () => {
    const card = buildAssignApprovalCard(base);
    expect(card.decline.argsPatch).toEqual({
      action: 'decline',
      taskId: 'task-1',
      idempotencyKey: 'key-1',
    });
  });

  // Regression guard for plan 03's D11: this card is the ONE that may offer
  // people, and it must keep offering them.
  it('still ships one alternate per remaining candidate', () => {
    const card = buildAssignApprovalCard(base);
    expect(card.alternates).toHaveLength(1);
    expect(card.alternates[0]?.argsPatch).toMatchObject({ assigneeUserIds: ['u2'] });
  });
});
