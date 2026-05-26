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
  /**
   * Whether the tool requires explicit user approval before execution. Pass a
   * boolean for static behaviour, or an async predicate evaluated per-call to
   * gate conditionally (e.g. only require approval for non-dry-run inputs).
   *
   * The value is passed through unchanged to `createTool({ requireApproval })`.
   * Mastra's tool-builder reads `Tool.requireApproval` (see
   * `mastra/packages/core/src/tools/types.ts:529` and `tool.ts:130`); the
   * agent loop emits a `tool-call-approval` stream chunk on each gated call.
   */
  needsApproval?:
    | boolean
    | ((
        input: z.infer<I>,
        ctx?: { requestContext?: Record<string, unknown>; workspace?: unknown },
      ) => boolean | Promise<boolean>);
  /**
   * Schema for the payload of `ctx.agent.suspend(payload)` /
   * `ctx.workflow.suspend(payload)`. Mastra validates the suspended payload
   * against this schema before pausing execution. (Note: this does not by
   * itself cause Mastra to emit a `tool-call-approval` chunk — that chunk is
   * emitted by the per-tool approval gate, set via `needsApproval: true` on
   * this spec, which `defineCopilotTool` translates to Mastra's native
   * `requireApproval` field.)
   */
  suspendSchema?: S;
  /**
   * Schema for the `resumeData` the tool receives when execution resumes
   * after a suspend. Read it from `ctx.agent.resumeData` /
   * `ctx.workflow.resumeData` inside `execute`.
   */
  resumeSchema?: R;
  /**
   * Override the default execution timeout (read 30s, write 60s). Capped by
   * COPILOT_TOOL_TIMEOUT_MAX_MS (default 300s) so a typo cannot effectively
   * disable the timeout. Prefer the default — set this only when a tool
   * genuinely needs longer (e.g. a bulk embedding call). For multi-minute
   * work, refactor into a workflow instead.
   */
  executionTimeoutMs?: number;
  execute: (
    input: z.infer<I>,
    ctx: CopilotToolContext<z.infer<S>, z.infer<R>>,
  ) => Promise<z.infer<O> | undefined>;
}
