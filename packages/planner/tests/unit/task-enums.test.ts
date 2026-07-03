import { describe, expect, it } from 'vitest';
import {
  numberToPriority,
  percentToProgress,
  priorityToNumber,
  progressToPercent,
} from '../../src/backend/db/task-enums.ts';

describe('task-enums progress mapping', () => {
  it('progressToPercent maps every enum value to its M365 bucket', () => {
    expect(progressToPercent('not_started')).toBe(0);
    expect(progressToPercent('in_progress')).toBe(50);
    expect(progressToPercent('done')).toBe(100);
  });

  it('percentToProgress maps fixed points and clamps everything else to in_progress', () => {
    expect(percentToProgress(0)).toBe('not_started');
    expect(percentToProgress(100)).toBe('done');
    expect(percentToProgress(50)).toBe('in_progress');
    expect(percentToProgress(1)).toBe('in_progress');
    expect(percentToProgress(99)).toBe('in_progress');
  });

  it('progress round-trips through both directions', () => {
    for (const p of ['not_started', 'in_progress', 'done'] as const) {
      expect(percentToProgress(progressToPercent(p))).toBe(p);
    }
  });
});

describe('task-enums priority mapping', () => {
  it('priorityToNumber maps every enum value to its M365 number', () => {
    expect(priorityToNumber('urgent')).toBe(1);
    expect(priorityToNumber('important')).toBe(3);
    expect(priorityToNumber('medium')).toBe(5);
    expect(priorityToNumber('low')).toBe(9);
  });

  it('numberToPriority maps the documented fixed points and defaults to medium', () => {
    expect(numberToPriority(1)).toBe('urgent');
    expect(numberToPriority(3)).toBe('important');
    expect(numberToPriority(9)).toBe('low');
    expect(numberToPriority(5)).toBe('medium');
    expect(numberToPriority(2)).toBe('medium');
    expect(numberToPriority(0)).toBe('medium');
  });

  it('priority round-trips through both directions', () => {
    for (const p of ['urgent', 'important', 'medium', 'low'] as const) {
      expect(numberToPriority(priorityToNumber(p))).toBe(p);
    }
  });
});
