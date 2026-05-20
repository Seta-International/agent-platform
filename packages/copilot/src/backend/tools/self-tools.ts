import { serverTimeTool } from './core.server-time.ts';
import { listMyRolesTool } from './identity.list-my-roles.ts';
import { updateMyDisplayNameTool } from './identity.update-my-display-name.ts';
import { whoAmITool } from './identity.who-am-i.ts';

export const STATIC_SELF_TOOLS = [
  serverTimeTool,
  whoAmITool,
  listMyRolesTool,
  updateMyDisplayNameTool,
] as const;
