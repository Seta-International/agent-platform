import type { CopilotTool } from './tool.ts';

const PERMISSIONS = new WeakMap<CopilotTool, string>();

export function registerToolPermission<T extends CopilotTool>(tool: T, permission: string): T {
  PERMISSIONS.set(tool, permission);
  return tool;
}

export function requiredPermissionFor(tool: CopilotTool): string | undefined {
  return PERMISSIONS.get(tool);
}
