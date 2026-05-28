import { describe, expect, it } from 'vitest';
import {
  agentLabel,
  extractLeafToolCalls,
  humanizeToolName,
} from '@/modules/agent/chat-experience/leaf-tool-calls';

describe('humanizeToolName', () => {
  it('humanizes snake_case + camelCase tool ids into Title Case', () => {
    expect(humanizeToolName('identity_whoAmI')).toBe('Identity Who Am I');
    expect(humanizeToolName('search_users_by_skills')).toBe('Search Users By Skills');
    expect(humanizeToolName('updateWorkingMemory')).toBe('Update Working Memory');
    expect(humanizeToolName('planner_getOpenTaskCountForUser')).toBe(
      'Planner Get Open Task Count For User',
    );
  });
  it('falls back for missing/empty input', () => {
    expect(humanizeToolName(undefined)).toBe('Tool');
    expect(humanizeToolName('')).toBe('Tool');
  });
});

describe('agentLabel', () => {
  it('humanizes a hyphenated agent id and strips the -supervisor suffix', () => {
    expect(agentLabel('planner-supervisor')).toBe('Planner');
    expect(agentLabel('people')).toBe('People');
  });
  it('falls back when id is missing', () => {
    expect(agentLabel(undefined)).toBe('sub-agent');
    expect(agentLabel('')).toBe('sub-agent');
  });
});

describe('extractLeafToolCalls', () => {
  const part = (data: unknown) => ({ type: 'data', name: 'tool-agent', data });

  it('ignores non tool-agent parts', () => {
    expect(
      extractLeafToolCalls([
        { type: 'text', text: 'hi' },
        { type: 'data', name: 'page-context', data: { id: 'x' } },
      ]),
    ).toEqual([]);
  });

  it('reads chunk-wrapped tool calls and matches results by toolCallId', () => {
    expect(
      extractLeafToolCalls([
        part({
          id: 'planner-supervisor',
          toolCalls: [
            { type: 'tool-call', payload: { toolCallId: 'c1', toolName: 'planner_createTask' } },
          ],
          toolResults: [{ type: 'tool-result', payload: { toolCallId: 'c1', isError: false } }],
        }),
      ]),
    ).toEqual([{ toolCallId: 'c1', name: 'planner_createTask', status: 'ok', via: 'Planner' }]);
  });

  it('reads flat (non-chunk-wrapped) tool calls', () => {
    expect(
      extractLeafToolCalls([
        part({
          id: 'identity',
          toolCalls: [{ toolCallId: 'c2', toolName: 'identity_whoAmI' }],
          toolResults: [{ toolCallId: 'c2', isError: false }],
        }),
      ]),
    ).toEqual([{ toolCallId: 'c2', name: 'identity_whoAmI', status: 'ok', via: 'Identity' }]);
  });

  it('marks a call running when it has no result yet', () => {
    expect(
      extractLeafToolCalls([
        part({
          id: 'planner',
          pendingToolCalls: [{ toolCallId: 'c3', toolName: 'planner_createTask' }],
        }),
      ]),
    ).toEqual([
      { toolCallId: 'c3', name: 'planner_createTask', status: 'running', via: 'Planner' },
    ]);
  });

  it('marks a call error when its result isError is true', () => {
    const rows = extractLeafToolCalls([
      part({
        id: 'planner',
        toolCalls: [{ payload: { toolCallId: 'c4', toolName: 'planner_createTask' } }],
        toolResults: [{ payload: { toolCallId: 'c4', isError: true } }],
      }),
    ]);
    expect(rows[0]).toMatchObject({ toolCallId: 'c4', status: 'error' });
  });

  it('dedupes a call appearing in both toolCalls and pendingToolCalls', () => {
    const rows = extractLeafToolCalls([
      part({
        id: 'planner',
        toolCalls: [{ toolCallId: 'c5', toolName: 'planner_createTask' }],
        pendingToolCalls: [{ toolCallId: 'c5', toolName: 'planner_createTask' }],
        toolResults: [{ toolCallId: 'c5', isError: false }],
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('ok');
  });
});
