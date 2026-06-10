import { AgentRegistry } from '@seta/agent-sdk';

// Module-side-effect imports — each module's register.ts calls AgentRegistry.register*.
// Top-level imports ensure they run before freeze().
import '@seta/core/agent-tools/register';
import '@seta/planner/agent-tools/register';
import '@seta/identity/agent-tools/register';
import '@seta/knowledge/agent-tools/register';
import './agent-tools/register-meta.ts';

export function initAgentRegistry(): void {
  if (AgentRegistry.isFrozen()) return;
  AgentRegistry.freeze();
}
