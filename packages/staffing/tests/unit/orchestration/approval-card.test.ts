import { ApprovalCardSchema } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { buildAssignApprovalCard } from '../../../src/backend/orchestration/approval-card.ts';
import type { Recommendation } from '../../../src/backend/orchestration/schemas.ts';

const REC = (over: Partial<Recommendation> = {}): Recommendation => ({
  userId: 'u1',
  name: 'Alice',
  skillMatch: ['aws', 'docker'],
  skillMatchCount: 2,
  status: 'available',
  availabilityScore: 0.9,
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
    });
    expect(card.intent).toBe('Assign "AWS migration"');
    expect(card.riskBadge).toBe('write');
    expect(card.primary).toEqual({
      label: 'Assign to Alice',
      argsPatch: { action: 'assign', assigneeUserIds: ['u1'], taskId: 't-1' },
    });
    expect(card.alternates).toEqual([
      {
        label: 'Assign to Bob',
        argsPatch: { action: 'assign', assigneeUserIds: ['u2'], taskId: 't-1' },
      },
    ]);
    expect(card.decline.label).toBe('Leave unassigned');
    // toolId routes the decision to the existing planner decider/mutex/supersede.
    expect(card.meta.toolId).toBe('planner_proposeAssignment');
    expect(card.meta.tenantId).toBe('tn1');
    expect(card.meta.userId).toBe('actor1');
  });

  it('renders candidates with skills, status, and availability score; null title falls back to the taskId', () => {
    const card = buildAssignApprovalCard({
      taskId: 't-1',
      title: null,
      recommendations: [REC()],
      tenantId: 'tn1',
      userId: 'actor1',
    });
    expect(card.intent).toBe('Assign "t-1"');
    expect(card.details).toEqual([
      {
        kind: 'entityList',
        select: 'multi',
        items: [
          {
            id: 'u1',
            type: 'user',
            label: 'Alice',
            secondary: 'skills: aws, docker · available',
            score: 0.9,
            primary: true,
          },
        ],
      },
      { kind: 'confidence', score: 0.9 },
    ]);
  });

  it('labels a nameless candidate by userId', () => {
    const card = buildAssignApprovalCard({
      taskId: 't-1',
      title: null,
      recommendations: [REC({ name: null })],
      tenantId: 'tn1',
      userId: 'actor1',
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
      }),
    ).toThrow();
  });
});
