import type { Actor } from '@seta/identity';
import type { ZodTypeAny } from 'zod';
import type { CopilotTool } from './tools/_types.ts';
import { serverTimeTool } from './tools/core.server-time.ts';
import { listMyRolesTool } from './tools/identity.list-my-roles.ts';
import { updateMyDisplayNameTool } from './tools/identity.update-my-display-name.ts';
import { whoAmITool } from './tools/identity.who-am-i.ts';

const TOOLS: Record<string, CopilotTool<ZodTypeAny>> = {
  'core.serverTime': serverTimeTool,
  'identity.whoAmI': whoAmITool,
  'identity.listMyRoles': listMyRolesTool,
  'identity.updateMyDisplayName': updateMyDisplayNameTool,
};

export async function runWrappedTool(
  name: string,
  session: { user_id: string },
  input: Record<string, unknown>,
): Promise<unknown> {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`unknown tool ${name}`);
  const actor: Actor = { user_id: session.user_id, type: 'user' };
  const parsed = tool.inputSchema.parse(input);
  return tool.execute(actor, parsed);
}
