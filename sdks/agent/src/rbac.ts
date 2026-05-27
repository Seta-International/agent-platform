import type { AgentTool } from './tool.ts';

const PERMISSIONS = new WeakMap<AgentTool, string>();

export function registerToolPermission<T extends AgentTool>(tool: T, permission: string): T {
  PERMISSIONS.set(tool, permission);
  return tool;
}

export function requiredPermissionFor(tool: AgentTool): string | undefined {
  return PERMISSIONS.get(tool);
}
