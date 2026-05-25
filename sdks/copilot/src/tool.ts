import type { ToolsInput } from '@mastra/core/agent';
import type { ToolExecutionContext } from '@mastra/core/tools';
import type { z } from 'zod';
import type { CopilotRequestContext } from './request-context.ts';

// Element type of Mastra's ToolsInput record — the bound it uses for any heterogeneous
// agent tool collection. Keeps modules' agent-tool authoring compatible with Agent's
// `tools` field without leaking internal Tool<…> generic params.
export type CopilotTool = ToolsInput[string];

export type CopilotToolContext<TSuspend = unknown, TResume = unknown> = ToolExecutionContext<
  TSuspend,
  TResume,
  CopilotRequestContext
>;

export interface CopilotToolSpec<
  I extends z.ZodTypeAny,
  O extends z.ZodTypeAny,
  S extends z.ZodTypeAny = z.ZodTypeAny,
  R extends z.ZodTypeAny = z.ZodTypeAny,
> {
  id: string;
  // Short human-friendly label shown in the chat UI (e.g. "Assign task").
  name: string;
  description: string;
  input: I;
  output: O;
  rbac?: string;
  needsApproval?: boolean;
  /**
   * Schema for the payload sent when the tool calls `ctx.agent.suspend(payload)`
   * (or `ctx.workflow.suspend(...)`). Use this to surface a typed HITL card to
   * the client — Mastra validates the payload against this schema before
   * emitting the `tool-call-approval` stream chunk.
   */
  suspendSchema?: S;
  /**
   * Schema for the `resumeData` the tool receives when execution resumes
   * after a suspend. Read it from `ctx.agent.resumeData` /
   * `ctx.workflow.resumeData` inside `execute`.
   */
  resumeSchema?: R;
  execute: (
    input: z.infer<I>,
    ctx: CopilotToolContext<z.infer<S>, z.infer<R>>,
  ) => Promise<z.infer<O> | undefined>;
}
