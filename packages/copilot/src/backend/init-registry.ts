import { CopilotRegistry } from '@seta/copilot-sdk';

// Module-side-effect imports — each module's register.ts calls CopilotRegistry.register*.
// Top-level imports ensure they run before freeze().
import '@seta/planner/agent-tools/register';
import '@seta/identity/agent-tools/register';
import '@seta/knowledge/agent-tools/register';
import './agent-tools/register-meta.ts';

export function initCopilotRegistry(): void {
  if (CopilotRegistry.isFrozen()) return;
  CopilotRegistry.freeze();
}
