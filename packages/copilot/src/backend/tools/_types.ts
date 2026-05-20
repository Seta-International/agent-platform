import type { Actor } from '@seta/identity';
import type { ZodTypeAny, z } from 'zod';

export type CopilotTool<I extends ZodTypeAny> = {
  name: string;
  description: string;
  inputSchema: I;
  requiredPermission: string;
  needsApproval?: boolean;
  execute: (actor: Actor, input: z.infer<I>) => Promise<unknown>;
};

type ToolBagEntry = {
  description: string;
  inputSchema: ZodTypeAny;
  needsApproval?: boolean;
  execute: (actor: Actor, input: unknown) => Promise<unknown>;
};

export function toToolBag(tools: readonly CopilotTool<ZodTypeAny>[]): Record<string, ToolBagEntry> {
  const bag: Record<string, ToolBagEntry> = {};
  for (const t of tools) {
    bag[t.name] = {
      description: t.description,
      inputSchema: t.inputSchema,
      needsApproval: t.needsApproval,
      execute: t.execute as (actor: Actor, input: unknown) => Promise<unknown>,
    };
  }
  return bag;
}
