import { describe, expect, it } from 'vitest';
import {
  buildCallerGroupContext,
  buildGroupInstructions,
} from '../../../src/backend/orchestration/agents/team-info.ts';

describe('buildCallerGroupContext', () => {
  it('reports "none" for an empty group list', () => {
    expect(buildCallerGroupContext([])).toEqual({ status: 'none' });
  });

  it('reports "single" and surfaces the id for exactly one group', () => {
    expect(buildCallerGroupContext([{ id: 'g-1', name: 'Engineering' }])).toEqual({
      status: 'single',
      groupId: 'g-1',
      groupName: 'Engineering',
    });
  });

  it('reports "ambiguous" for more than one group', () => {
    const groups = [
      { id: 'g-1', name: 'Engineering' },
      { id: 'g-2', name: 'Platform' },
    ];
    expect(buildCallerGroupContext(groups)).toEqual({ status: 'ambiguous', groups });
  });
});

describe('buildGroupInstructions', () => {
  it('single: names the group but forbids deriving a count from it', () => {
    const text = buildGroupInstructions({
      status: 'single',
      groupId: 'g-1',
      groupName: 'Engineering',
    });
    expect(text).toContain('Engineering');
    expect(text).toContain('g-1');
    expect(text).toMatch(/NO member count/i);
    expect(text).toContain('planner_getGroupOverview');
  });

  it('ambiguous: lists names, leaks no ids, and forces a clarify before any tool', () => {
    const text = buildGroupInstructions({
      status: 'ambiguous',
      groups: [
        { id: 'g-1', name: 'Engineering' },
        { id: 'g-2', name: 'Platform' },
      ],
    });
    expect(text).toContain('Engineering');
    expect(text).toContain('Platform');
    // Identity ids must NOT leak into the clarify prompt — only names.
    expect(text).not.toContain('g-1');
    expect(text).not.toContain('g-2');
    expect(text).toMatch(/must first ask/i);
    expect(text).toMatch(/never state a member count/i);
  });

  it('none: refuses to invent a group', () => {
    const text = buildGroupInstructions({ status: 'none' });
    expect(text).toMatch(/no resolvable group/i);
    expect(text).toMatch(/do not invent/i);
  });
});
