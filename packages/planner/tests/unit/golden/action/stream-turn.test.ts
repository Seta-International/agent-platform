import { expect, it } from 'vitest';
import { drainActionTurn } from '../../../fixtures/golden/action/stream-turn.ts';

/** A stand-in for one ChatStreamRun. Chunk shapes are the ones pinned against the
 *  real runtime by
 *  tests/integration/orchestration/assignment/suspend-characterization.test.ts. */
function fakeRun(chunks: unknown[], text = '') {
  const suspended = chunks.some((c) => (c as { type: string }).type === 'tool-call-suspended');
  return {
    output: {
      fullStream: (async function* () {
        for (const c of chunks) yield c;
      })(),
      text: Promise.resolve(suspended ? '' : text),
      finishReason: Promise.resolve(suspended ? 'suspended' : 'stop'),
    },
  } as never;
}

it('captures the suspend chunk: card, runId and toolCallId', async () => {
  const card = {
    intent: 'Update "Deploy API"',
    primary: {},
    meta: { toolId: 'planner_updateTask' },
  };
  const outcome = await drainActionTurn(
    fakeRun([
      { type: 'text-delta', payload: { text: 'Đổi due date ' } },
      { type: 'text-delta', payload: { text: 'sang 19/08.' } },
      {
        type: 'tool-call-suspended',
        runId: 'run-1',
        payload: {
          toolCallId: 'call-1',
          toolName: 'planner_updateTask',
          args: { taskRefs: ['t1'] },
          suspendPayload: { card },
        },
      },
    ]),
  );
  expect(outcome.suspended).toBe(true);
  expect(outcome.card).toEqual(card);
  expect(outcome.mastraRunId).toBe('run-1');
  expect(outcome.toolCallId).toBe('call-1');
  // A suspended turn has no assembled result (`await stream.text` is ''), so the
  // narration streamed BEFORE the card is the answer — and it is what D19 ("the
  // reply names the task") is scored against.
  expect(outcome.answer).toBe('Đổi due date sang 19/08.');
  expect(outcome.toolCalls).toEqual([
    { toolName: 'planner_updateTask', args: { taskRefs: ['t1'] }, result: undefined, ok: true },
  ]);
});

it('records a completed tool call with its result', async () => {
  const outcome = await drainActionTurn(
    fakeRun(
      [
        {
          type: 'tool-call',
          payload: { toolCallId: 'c1', toolName: 'planner_getTask', args: { taskId: 't1' } },
        },
        {
          type: 'tool-result',
          payload: {
            toolCallId: 'c1',
            toolName: 'planner_getTask',
            result: { title: 'Deploy API' },
          },
        },
        { type: 'finish', payload: {} },
      ],
      'Đã đổi due date.',
    ),
  );
  expect(outcome.suspended).toBe(false);
  expect(outcome.answer).toBe('Đã đổi due date.');
  expect(outcome.toolCalls).toEqual([
    {
      toolName: 'planner_getTask',
      args: { taskId: 't1' },
      result: { title: 'Deploy API' },
      ok: true,
    },
  ]);
});

it('marks a tool call that returned a graceful error payload as failed', async () => {
  const outcome = await drainActionTurn(
    fakeRun([
      {
        type: 'tool-call',
        payload: { toolCallId: 'c1', toolName: 'planner_updateTask', args: {} },
      },
      {
        type: 'tool-result',
        payload: {
          toolCallId: 'c1',
          toolName: 'planner_updateTask',
          result: { error: 'FORBIDDEN' },
        },
      },
      { type: 'finish', payload: {} },
    ]),
  );
  expect(outcome.toolCalls[0]!.ok).toBe(false);
});
