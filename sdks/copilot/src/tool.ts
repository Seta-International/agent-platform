import type { ToolsInput } from '@mastra/core/agent';
import type { ToolExecutionContext } from '@mastra/core/tools';
import type { z } from 'zod';
import type { CopilotRequestContext } from './request-context.ts';

// Element type of Mastra's ToolsInput record — the bound it uses for any heterogeneous
// agent tool collection. Keeps modules' agent-tool authoring compatible with Agent's
// `tools` field without leaking internal Tool<…> generic params.
export type CopilotTool = ToolsInput[string];

export type CopilotToolContext = ToolExecutionContext<unknown, unknown, CopilotRequestContext>;

export interface CopilotToolSpec<I extends z.ZodTypeAny, O extends z.ZodTypeAny> {
  id: string;
  // Short human-friendly label shown in the chat UI (e.g. "Assign task").
  name: string;
  description: string;
  input: I;
  output: O;
  rbac?: string;
  needsApproval?: boolean;
  execute: (input: z.infer<I>, ctx: CopilotToolContext) => Promise<z.infer<O>>;
}
