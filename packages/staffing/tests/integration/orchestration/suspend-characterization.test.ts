// ─────────────────────────────────────────────────────────────────────────────
// CHARACTERIZATION SPIKE — Mastra agentic suspend/resume semantics
//
// Pins down the load-bearing unknowns for the chat-HITL streaming backbone.
// Everything in later tasks substitutes these findings VERBATIM, so the field
// paths and accessors below are confirmed against the REAL Mastra runtime
// (@mastra/core@1.37) driven by a mock LLM + real Mastra storage — NOT guessed
// from npm types. Run: `pnpm --filter @seta/staffing test suspend-characterization`.
//
// Storage note: this spike persists the suspend snapshot in Mastra's real
// `InMemoryStore` (@mastra/core/storage) — the same store Mastra's own canonical
// suspend/resume tests use. Suspend/resume SEMANTICS are storage-agnostic: the
// agentic-execution workflow snapshot is written via the same MastraStorage
// interface that PostgresStore (schemaName 'agent') implements in production
// (packages/agent/src/backend/runtime.ts). The accessors and chunk shapes below
// are therefore identical under PostgresStore. The testcontainers Postgres from
// withAgentTestDb is still provisioned (real DB harness, repo idiom) so the test
// runs in the same environment later integration tests will.
//
// ── FINDINGS (verbatim from the runtime; see console.log FINDINGS block) ──────
//
// 1. ctx.suspend accessor (agentic):  ctx.agent.suspend(payload)
//    Signature: `(payload) => Promise<...>` where `payload` is validated against
//    the tool's `suspendSchema`. It is `ctx.agent.suspend`, NOT `ctx.suspend`
//    (`ctx.suspend` is the WORKFLOW-step accessor and is undefined for agent
//    tools). CONFIRMS the prior in sdks/agent/src/tool.ts + hitl/chat-hitl.ts.
//
// 2. resumeData read location:  ctx.agent.resumeData
//    Set on the SECOND execute() invocation (the resume), validated against the
//    tool's `resumeSchema`. It is `ctx.agent.resumeData`, NOT `ctx.resumeData`
//    (the workflow-step accessor). On the first (suspending) execute it is
//    undefined — the tool branches on `if (!ctx.agent.resumeData) suspend(...)`.
//
// 3. `tool-call-suspended` chunk field paths (the chunk is `{ type, runId, from,
//    payload: { toolCallId, toolName, suspendPayload, args, resumeSchema } }`):
//      - runId:         chunk.runId          (top-level, BaseChunkType)
//      - toolCallId:    chunk.payload.toolCallId
//      - suspendPayload (the card): chunk.payload.suspendPayload
//    (also available: chunk.payload.toolName, chunk.payload.args,
//     chunk.payload.resumeSchema — the JSON-schema string of resumeSchema.)
//
// 4. Suspend-vs-complete branch signal on the awaited stream object:
//    On a SUSPENDED run:
//      - await stream.finishReason  →  'suspended'   (NOT 'stop', NOT 'tool-calls')
//      - await stream.text          →  ''            (empty — no assistant text)
//      - await stream.toolResults   →  []            (the suspended call produced
//                                                      no tool-result)
//    On the COMPLETED (resumed) run:
//      - await stream.finishReason  →  'stop'
//      - await stream.text          →  'done'        (the model's final text)
//      - await stream.toolResults   →  [<one result>] (the resumed execute's output)
//    `await stream.toolResults` returns an array of the RAW `tool-result`
//    chunks; the tool's returned value is at `el.payload.result` (NOT el.output)
//    — each el is `{ type: 'tool-result', payload: { toolCallId, toolName,
//    result, args, ... } }`.
//    => streamChat branches on `finishReason === 'suspended'` (and/or the
//       presence of a `tool-call-suspended` chunk in fullStream). A completed
//       turn ends with finishReason 'stop' and a non-empty toolResults. NOTE:
//       the suspended finishReason is the dedicated literal 'suspended' — it is
//       NOT 'tool-calls' (that surfaces only on an approval-gate pause).
//    fullStream chunk-type sequences (verbatim from the run):
//      suspended run:  start, step-start, tool-call, tool-call-suspended
//                      (NO `finish` chunk — the stream ends at the suspend).
//      resume run:     tool-result, step-finish, step-start, text-start,
//                      text-delta, text-end, step-finish, finish
//      => "no `finish` chunk + a `tool-call-suspended` chunk" is the in-stream
//         signal; the awaited finishReason 'suspended' is the post-drain signal.
//
// 5. resumeStream re-enters the SAME execute with resumeData set:
//      await agent.resumeStream(resumeData, { runId: stream.runId })
//    re-runs the suspended tool's execute(), this time with
//    `ctx.agent.resumeData === resumeData`. For a SINGLE suspended tool, the
//    `toolCallId` option is NOT required (Mastra resolves the one suspended
//    call). `toolCallId` is only needed to disambiguate when MULTIPLE tools are
//    suspended concurrently (see mastra tool-concurrency.test.ts). The agent
//    MUST be registered on a Mastra instance with storage and obtained via
//    `mastra.getAgent(...)` so resumeStream can load the persisted snapshot.
//    runId: the Mastra `stream.runId` IS a uuid (v4) — asserted below.
// ─────────────────────────────────────────────────────────────────────────────

import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import { InMemoryStore } from '@mastra/core/storage';
import { defineAgentTool } from '@seta/agent-sdk';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { withAgentTestDb } from '../../helpers.ts';

const TENANT = '00000000-0000-4000-8000-0000000000b1';
const ACTOR = '00000000-0000-4000-8000-0000000000c1';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

// Scripted model: step 0 calls the suspending tool; step 1 (after resume) stops
// with text. Mirrors the doGenerate/doStream shape from inline-run.test.ts.
type Step = { content: Record<string, unknown>[]; finishReason: 'stop' | 'tool-calls' };
const TOOL_CALL: Step = {
  content: [
    {
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'awaitApproval',
      input: '{"note":"ship it"}',
    },
  ],
  finishReason: 'tool-calls',
};
const STOP: Step = { content: [{ type: 'text', text: 'done' }], finishReason: 'stop' };

function stepToStreamParts(s: Step) {
  const parts: Record<string, unknown>[] = [{ type: 'stream-start', warnings: [] }];
  for (const c of s.content) {
    if (c.type === 'tool-call') {
      parts.push({
        type: 'tool-call',
        toolCallId: c.toolCallId,
        toolName: c.toolName,
        input: c.input,
      });
    } else if (c.type === 'text') {
      parts.push({ type: 'text-start', id: '0' });
      parts.push({ type: 'text-delta', id: '0', delta: c.text });
      parts.push({ type: 'text-end', id: '0' });
    }
  }
  parts.push({ type: 'finish', usage, finishReason: s.finishReason });
  return parts;
}

function scriptedModel(steps: Step[]) {
  let call = -1;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      call += 1;
      const s = steps[Math.min(call, steps.length - 1)] ?? STOP;
      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: s.finishReason,
        usage,
        content: s.content,
        warnings: [],
      } as never;
    },
    doStream: async () => {
      call += 1;
      const s = steps[Math.min(call, steps.length - 1)] ?? STOP;
      const parts = stepToStreamParts(s);
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const p of parts) controller.enqueue(p);
            controller.close();
          },
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      } as never;
    },
  });
}

describe('Mastra agentic suspend/resume characterization spike', () => {
  it('suspends on first execute, re-enters with resumeData on resumeStream', async () => {
    await withAgentTestDb(async () => {
      // Records what the runtime actually handed to execute() so we confirm the
      // accessors empirically rather than asserting our own assumptions.
      const observed = {
        firstHasSuspend: false,
        firstSuspendIsAgent: false,
        firstResumeData: undefined as unknown,
        ranTwice: false,
        secondResumeData: undefined as unknown,
        resumeDataPath: '(none)' as string,
      };

      const awaitApproval = defineAgentTool({
        id: 'awaitApproval',
        name: 'Await approval',
        description: 'Suspends once to await an approval decision, then completes.',
        input: z.object({ note: z.string() }),
        output: z.object({ decided: z.string() }),
        suspendSchema: z.object({ kind: z.literal('approval'), note: z.string() }),
        resumeSchema: z.object({ approved: z.boolean() }),
        execute: async (input, ctx) => {
          // Empirically probe BOTH accessor families on the real ctx.
          const agentCtx = (
            ctx as unknown as { agent?: { suspend?: unknown; resumeData?: unknown } }
          ).agent;
          const flatSuspend = (ctx as unknown as { suspend?: unknown }).suspend;
          const flatResume = (ctx as unknown as { resumeData?: unknown }).resumeData;
          const resumeData = ctx.agent?.resumeData;

          if (!resumeData) {
            // FIRST execute — the suspending pass.
            observed.firstHasSuspend = typeof agentCtx?.suspend === 'function';
            observed.firstSuspendIsAgent =
              typeof agentCtx?.suspend === 'function' && typeof flatSuspend !== 'function';
            observed.firstResumeData = agentCtx?.resumeData;
            if (typeof ctx.agent?.suspend !== 'function') {
              throw new Error('ctx.agent.suspend is not a function on first execute');
            }
            await ctx.agent.suspend({ kind: 'approval', note: input.note });
            // Mastra unwinds execution at suspend(); code past it never runs on
            // the suspending pass. Return is unreachable here but satisfies types.
            return { decided: 'unreachable' };
          }

          // SECOND execute — the resume pass.
          observed.ranTwice = true;
          observed.secondResumeData = resumeData;
          observed.resumeDataPath =
            agentCtx?.resumeData !== undefined
              ? 'ctx.agent.resumeData'
              : flatResume !== undefined
                ? 'ctx.resumeData'
                : '(none)';
          return { decided: resumeData.approved ? 'approved' : 'rejected' };
        },
      });

      const rc = new RequestContext();
      rc.set('actor', { type: 'user', user_id: ACTOR });
      rc.set('tenant_id', TENANT);

      const agentDef = new Agent({
        id: 'spike.suspender',
        name: 'Suspend Spike Agent',
        instructions: 'Call awaitApproval, then reply.',
        model: scriptedModel([TOOL_CALL, STOP]),
        tools: { awaitApproval } as never,
      });

      // Register on a Mastra with storage so resumeStream can load the snapshot.
      const mastra = new Mastra({
        agents: { suspender: agentDef },
        storage: new InMemoryStore(),
        logger: false,
      });
      const agent = mastra.getAgent('suspender');

      // ── First run: drain fullStream, capture the tool-call-suspended chunk ──
      const stream = await agent.stream('please approve', {
        requestContext: rc,
        maxSteps: 5,
      });

      let suspendedChunk:
        | {
            runId: string;
            payload: { toolCallId: string; toolName: string; suspendPayload: unknown };
          }
        | undefined;
      const seenChunkTypes: string[] = [];
      for await (const chunk of stream.fullStream) {
        seenChunkTypes.push((chunk as { type: string }).type);
        if ((chunk as { type: string }).type === 'tool-call-suspended') {
          suspendedChunk = chunk as never;
        }
      }

      const runId = stream.runId;
      const suspendedFinishReason = await stream.finishReason;
      const suspendedText = await stream.text;
      const suspendedToolResults = await stream.toolResults;

      // ── Assertions: the suspend happened and the chunk has the documented shape ──
      expect(observed.firstHasSuspend).toBe(true);
      expect(observed.firstSuspendIsAgent).toBe(true);
      expect(observed.firstResumeData).toBeUndefined();
      expect(suspendedChunk).toBeDefined();
      expect(suspendedChunk!.runId).toBe(runId);
      expect(suspendedChunk!.payload.toolCallId).toBeTruthy();
      expect(suspendedChunk!.payload.toolName).toBe('awaitApproval');
      expect(suspendedChunk!.payload.suspendPayload).toEqual({ kind: 'approval', note: 'ship it' });
      expect(UUID_V4.test(runId)).toBe(true);

      // Suspended-run branch signals.
      expect(suspendedFinishReason).toBe('suspended');
      expect(suspendedText).toBe('');
      expect(suspendedToolResults).toEqual([]);

      // ── Resume: re-enters the same execute with resumeData set ──
      const resumeStream = await agent.resumeStream({ approved: true }, { runId });
      const resumedChunkTypes: string[] = [];
      for await (const chunk of resumeStream.fullStream) {
        resumedChunkTypes.push((chunk as { type: string }).type);
      }
      const resumedFinishReason = await resumeStream.finishReason;
      const resumedText = await resumeStream.text;
      const resumedToolResults = (await resumeStream.toolResults) as Array<{
        payload?: { result?: unknown };
      }>;

      expect(observed.ranTwice).toBe(true);
      expect(observed.secondResumeData).toEqual({ approved: true });
      expect(observed.resumeDataPath).toBe('ctx.agent.resumeData');

      // Completed-run branch signals.
      expect(resumedFinishReason).toBe('stop');
      expect(resumedText).toBe('done');
      expect(resumedToolResults.length).toBe(1);
      // Each toolResults element is the raw `tool-result` chunk; the tool's
      // returned output is at chunk.payload.result (NOT chunk.output).
      expect(resumedToolResults[0]?.payload?.result).toEqual({ decided: 'approved' });

      // ── FINDINGS: print verbatim so the comment block above stays grounded ──
      console.log(
        'FINDINGS',
        JSON.stringify(
          {
            '1_suspend_accessor': {
              isAgentSuspend: observed.firstSuspendIsAgent,
              ctxAgentSuspendIsFunction: observed.firstHasSuspend,
            },
            '2_resumeData_path': observed.resumeDataPath,
            '3_suspended_chunk': {
              runId: suspendedChunk!.runId,
              'payload.toolCallId': suspendedChunk!.payload.toolCallId,
              'payload.toolName': suspendedChunk!.payload.toolName,
              'payload.suspendPayload': suspendedChunk!.payload.suspendPayload,
            },
            '4_branch_signals': {
              suspended: {
                finishReason: suspendedFinishReason,
                text: suspendedText,
                toolResultsLen: suspendedToolResults.length,
              },
              completed: {
                finishReason: resumedFinishReason,
                text: resumedText,
                toolResultsLen: resumedToolResults.length,
                'toolResult0.payload.result': resumedToolResults[0]?.payload?.result,
              },
            },
            '5_resume': {
              reEnteredSameExecute: observed.ranTwice,
              resumeDataSeen: observed.secondResumeData,
              toolCallIdRequiredForSingle: false,
              runId,
              runIdIsUuidV4: UUID_V4.test(runId),
            },
            _chunkTypes: { firstRun: seenChunkTypes, resumeRun: resumedChunkTypes },
          },
          null,
          2,
        ),
      );
    });
  });
});
