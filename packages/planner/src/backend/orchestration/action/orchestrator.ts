import { Mastra } from '@mastra/core';
import { Agent, type MastraDBMessage } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { ConsoleLogger, type LogLevel } from '@mastra/core/logger';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import {
  type AgentResult,
  buildAgentRequestContext,
  type SpecializedAgentRunCtx,
  type SpecializedAgentSpec,
  withTemporalContext,
} from '@seta/agent-sdk';
import type { ChatStreamRun } from '@seta/shared-orchestration';
import { z } from 'zod';
import { pickModel } from '../assignment/model.ts';
import { renderOpenPreviewBlock } from './open-preview-block.ts';
import { makeActionTools } from './orchestrator.tools.ts';
import type { ActionPorts } from './ports.ts';
import type { ActionResume } from './schemas.ts';
import { OpenPreviewSchema } from './schemas.ts';

export const ActionInputSchema = z.object({
  userText: z.string(),
  taskId: z.string().nullable(),
  /** The newest pending A2 preview in this thread, found by the SERVER before the
   *  turn was dispatched (FUT-840). Authoritative data, not chat history. */
  openPreview: OpenPreviewSchema.nullish(),
});
export const ActionResultSchema = z.object({
  message: z.string(),
  taskId: z.string().nullable().optional(),
  updated: z.boolean().optional(),
});
type In = z.infer<typeof ActionInputSchema>;
type Out = z.infer<typeof ActionResultSchema>;

const AGENT_ID = 'planner.action';

export interface ActionOrchestratorDeps {
  ports: ActionPorts;
  resolveModel: () => MastraModelConfig;
  mastraStorage: MastraCompositeStore;
  /** Injectable clock for deterministic temporal anchors (evals freeze it). */
  now?: () => Date;
}

export type ActionResumeCtx = SpecializedAgentRunCtx & {
  mastraRunId: string;
  toolCallId?: string;
};

export function instructionsText(): string {
  return [
    'You change tasks in the planner. You do exactly one kind of work: turning a',
    "user's sentence into ONE proposed change, then showing it to them for",
    'confirmation. You never write anything yourself.',
    '',
    'HOW TO WORK',
    '1. Find the task or tasks. Use planner_getTask when the user gave a UUID or referred',
    '   to a task already discussed ("the first one", "that task"). Use planner_queryTasks',
    '   to search by title or criteria. If more than one task matches a single reference,',
    '   ASK which one — never pick for the user.',
    '2. Work out which fields change. Supported: title, description, dueAt, startAt,',
    '   priority (urgent/important/medium/low), status (not_started/in_progress/completed).',
    '   Pass ONLY the fields the user asked for, using those words — never a raw number.',
    '3. Call planner_updateTask ONCE, listing every task in taskRefs. The same change is',
    '   applied to all of them. It shows the user one preview and pauses.',
    '',
    'SEVERAL TASKS AT ONCE — pass up to 20 tasks in one call. If the user asks for more',
    'than 20 tasks, say the limit plainly and change nothing. NEVER SPLIT a larger request',
    'into two or more calls: one request the user made is one preview they confirm.',
    'Positions like "#3" only reach the last 10 tasks discussed here. For anything bigger,',
    'search with planner_queryTasks first and pass the taskId values it returns — never',
    'guess a position past the tenth.',
    '',
    'DATES — resolve every relative phrase to an absolute date BEFORE calling the tool,',
    'using the temporal block above. A bare weekday means the next occurrence strictly',
    'AFTER today: "Friday" said on a Friday is the following Friday. When a phrase could',
    'mean two different days, ask which one — for example "Thứ Sáu 07/08 hay 14/08?".',
    'Pass dates as YYYY-MM-DD; the server applies the time of day.',
    '',
    'LINKING TWO TASKS — planner_linkTasks records a relationship and deletes nothing.',
    'Direction matters for two of the three kinds: with `duplicates` the SOURCE task is',
    'the duplicate, and with `blocks` the SOURCE task is the blocker. When the user just',
    'says "related" or "link", use relates. If you cannot tell which task the user means',
    'on either side, ask — never guess a target.',
    '',
    'MERGING DUPLICATES — planner_mergeTasks marks one task as a duplicate of the other',
    'and moves it to the trash. It is the only thing you do that deletes anything, so be',
    'certain which side is which: duplicateTaskRef is the task that goes to the TRASH and',
    'keepTaskRef is the task that survives. If the user has not made clear which one they',
    'want to keep, ask them — never pick for them. Nothing is copied between the two',
    'tasks, so if the duplicate holds information the keeper lacks, say so before merging.',
    'If the user only wants the two marked as related, use planner_linkTasks instead.',
    '',
    'ASSIGNING PEOPLE — planner_assignTask sets who a task is assigned to, and it REPLACES',
    'the whole assignee list. List everybody who should end up on the task, not just the',
    'person the sentence mentions.',
    'When the request is RELATIVE to whoever owns it now — "thay B bằng A", "giao thêm cho',
    'A", "bỏ B ra" — call planner_getTask FIRST, read its assignees, and work out the final',
    'set from that. Sending only the named person would silently un-assign everyone else.',
    'Use planner_resolveMember when you need to turn a name into a person and the task',
    'context does not already give you one; if it returns more than one match, ask which',
    'person they mean — never pick.',
    'When the user names NOBODY ("assign someone to this", "giao cho ai đó"), do not guess:',
    'say you can ask for a recommendation instead.',
    '',
    'CREATING A TASK — planner_createTask makes ONE new task in ONE plan, and writes nothing',
    'until the user confirms. Every task belongs to a plan: if the user has not named one and',
    'the conversation does not make it obvious which they mean, ASK — never guess a plan.',
    'The tool looks for similar tasks in that plan itself and puts them on the same card, so',
    'do not search for duplicates first. It sets no assignee; if the user wants the task',
    'assigned as well, create it first, then offer to assign it in the next turn.',
    'It also puts the task in the first column of the plan by itself, and the card shows which',
    'one — never ask the user to pick a bucket. If they want it somewhere else, tell them they',
    'can drag it across the board once it exists.',
    '',
    'COMMENTING — planner_commentTask posts one plain-text comment on a task, as the user.',
    'Write the body exactly as they want it to appear: do not summarise their words, do not',
    'add a greeting or a sign-off. If they have not said what the comment should say, ASK.',
    'A comment changes nothing about the task itself — if they want the due date, status or',
    'assignee changed, use the tool that changes it.',
    '',
    'WHAT YOU CANNOT DO — say so plainly and name what you can do instead. You cannot',
    'permanently delete anything, and you do not answer general questions. If the user wants',
    'a task gone: when it duplicates another task, offer planner_mergeTasks; otherwise tell',
    'them they can move it to the trash themselves from the task menu.',
    '',
    'NEVER INVENT A VALUE. If the user names a field but not a value ("change the deadline"),',
    'ask for the value. If you cannot tell which task they mean, ask. One question at a time.',
    '',
    'ADJUSTING A PREVIEW THAT IS ALREADY ON SCREEN — when an OPEN PREVIEW block appears',
    'above, the user can correct that proposal just by telling you what to change. Call the',
    'SAME tool the block names with the SAME task, and send ONLY the fields the user has',
    'just named. Everything they already agreed to stays unless they change it.',
    'Set correction: true when they are NARROWING the proposal rather than adding to it',
    '("không phải", "chỉ ... thôi", "à thôi", "instead"); leave it out when they are ADDING',
    '("và ... nữa", "also"). To leave one field alone while the rest stands, name it in',
    'dropFields. When they ask for a DIFFERENT KIND OF CHANGE — "and assign it to Tuan as',
    'well" on an update preview — say in one sentence that they should confirm or cancel the',
    'open preview first. NAME THE TASK in your one-sentence confirmation, and quote the dates',
    'the tool gives you back rather than working them out yourself.',
    '',
    'AFTER THE PREVIEW APPEARS, tell the user in one short sentence what will change and',
    'that you are waiting for them to confirm. After they confirm, confirm it is done in',
    'one sentence. If the tool reports that a task changed since the preview, say so and',
    'offer to show a fresh preview.',
  ].join('\n');
}

interface BuiltAction {
  agent: Agent;
  rc: RequestContext;
  message: string | (MastraDBMessage | string)[];
  runOptions: Record<string, unknown>;
  instructions: string;
  tools: Record<string, unknown>;
}

async function buildAction(
  deps: ActionOrchestratorDeps,
  input: In,
  ctx: SpecializedAgentRunCtx,
): Promise<BuiltAction> {
  const rc = buildAgentRequestContext(ctx);

  const tools = makeActionTools({ ports: deps.ports, ctx, openPreview: input.openPreview ?? null });

  // Wrapped at CONSTRUCTION time, never at module load — a module-load call
  // would freeze the date at process start, the bug FUT-800 fixed.
  const instructions = withTemporalContext(instructionsText(), { now: deps.now?.() });

  const agent = new Agent({
    id: AGENT_ID,
    name: 'Planner Action Agent',
    instructions,
    model: pickModel(ctx, deps.resolveModel),
    tools: tools as never,
    inputProcessors: [new TokenLimiterProcessor({ limit: 100_000 })],
  });

  const hasStorage = typeof deps.mastraStorage?.getStore === 'function';
  const mastra = new Mastra({
    agents: { [AGENT_ID]: agent },
    ...(hasStorage ? { storage: deps.mastraStorage } : {}),
    logger: new ConsoleLogger({
      name: 'Mastra',
      level: (process.env.MASTRA_LOG_LEVEL as LogLevel) ?? 'warn',
    }),
    ...(hasStorage
      ? {
          observability: new Observability({
            configs: {
              default: { serviceName: 'action-agent', exporters: [new MastraStorageExporter()] },
            },
          }),
        }
      : {}),
  });
  const boundAgent = mastra.getAgent(AGENT_ID);

  const currentMessage = [
    `User message: ${input.userText}`,
    `Current taskId: ${input.taskId ?? '(none)'}`,
    // Authoritative data for this turn, appended AFTER the task context so the
    // model reads the request first and the state it may be adjusting second.
    ...(input.openPreview ? ['', renderOpenPreviewBlock(input.openPreview)] : []),
  ].join('\n');
  const message: string | (MastraDBMessage | string)[] = ctx.sessionHistory?.length
    ? [...ctx.sessionHistory, currentMessage]
    : currentMessage;

  const runOptions: Record<string, unknown> = {
    requestContext: rc,
    maxSteps: 8,
    abortSignal: ctx.abortSignal,
    providerOptions: { openai: { reasoningSummary: 'auto' } },
  };

  return { agent: boundAgent, rc, message, runOptions, instructions, tools };
}

/** A2 emits no reasoning trace or citations: its one claim is the preview card,
 *  which the user reads in full before confirming. Built fresh per call so no
 *  turn can mutate another turn's envelope. */
function trust(confidenceScore = 0.8): AgentResult<Out>['trust'] {
  return { reasoningTrace: [], evidenceCitations: [], confidenceScore };
}

async function finalizeFrom(stream: {
  text: Promise<string | undefined>;
}): Promise<AgentResult<Out>> {
  const text = (await stream.text)?.trim();
  return {
    result: { message: text || 'I could not complete that change.' },
    trust: trust(text ? 0.8 : 0.2),
  };
}

export function makeActionAgent(deps: ActionOrchestratorDeps): SpecializedAgentSpec<In, Out> {
  return {
    id: AGENT_ID,
    description: 'Turns a change request into one previewed, confirmable task update.',
    inputSchema: ActionInputSchema,
    outputSchema: ActionResultSchema,
    run: async (input, ctx): Promise<AgentResult<Out>> => {
      const built = await buildAction(deps, input, ctx);
      const r = await built.agent.generate(built.message, built.runOptions);
      return { result: { message: r.text ?? '' }, trust: trust() };
    },
  };
}

/** Streaming chat entrypoint — same contract as the assignment runtime's. */
export function makeActionStreamer(deps: ActionOrchestratorDeps) {
  return async function startChat(input: In, ctx: SpecializedAgentRunCtx): Promise<ChatStreamRun> {
    const built = await buildAction(deps, input, ctx);
    const output = (await built.agent.stream(
      built.message,
      built.runOptions,
    )) as unknown as ChatStreamRun['output'];
    return {
      output,
      finalize: () => finalizeFrom(output as unknown as { text: Promise<string | undefined> }),
    };
  };
}

/** Resume entrypoint. Rebuilds the agent on the shared storage-backed Mastra so
 *  the persisted native-suspend snapshot reloads by runId. */
export function makeActionResumer(deps: ActionOrchestratorDeps) {
  return async function resumeChat(
    resume: ActionResume,
    ctx: ActionResumeCtx,
  ): Promise<ChatStreamRun> {
    const built = await buildAction(deps, { userText: '', taskId: null }, ctx);
    const output = (await (
      built.agent as unknown as {
        resumeStream: (
          resumeData: ActionResume,
          opts: { runId: string; toolCallId?: string; requestContext: RequestContext },
        ) => Promise<unknown>;
      }
    ).resumeStream(resume, {
      runId: ctx.mastraRunId,
      ...(ctx.toolCallId ? { toolCallId: ctx.toolCallId } : {}),
      requestContext: built.rc,
    })) as ChatStreamRun['output'];
    return {
      output,
      finalize: () => finalizeFrom(output as unknown as { text: Promise<string | undefined> }),
    };
  };
}
