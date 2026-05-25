// Registry slots for cross-module reads that flow OUT of @seta/copilot to
// feature modules at runtime, without creating a planner ↔ copilot package
// cycle.
//
// Why injection instead of a `@seta/copilot/agent-reads` import: copilot
// already imports each feature module (init-registry's side-effect loads),
// so a feature module importing copilot back closes a workspace cycle that
// turbo and pnpm refuse. The SDK is the shared contract layer that both
// sides depend on, so it owns the slot.
//
// Lifecycle:
//   1. copilot's `registerCopilot` calls `registerPendingAssignReader(impl)`
//      during boot, AFTER the registry is frozen.
//   2. Feature modules call `getPendingAssignRunIdForTask(...)` from their
//      domain/agent-tool code. Calls before registration throw.

export interface PendingAssignReaderOpts {
  taskId: string;
  tenantId: string;
}

export type PendingAssignReader = (opts: PendingAssignReaderOpts) => Promise<string | null>;

let pendingAssignReader: PendingAssignReader | null = null;

export function registerPendingAssignReader(impl: PendingAssignReader): void {
  pendingAssignReader = impl;
}

export async function getPendingAssignRunIdForTask(
  opts: PendingAssignReaderOpts,
): Promise<string | null> {
  // No reader registered ⇒ no copilot in this boot (or pre-boot). Treat as
  // "no in-flight run" rather than crashing the planner read path. App
  // boots that include copilot register the impl in registerCopilot().
  if (!pendingAssignReader) return null;
  return pendingAssignReader(opts);
}

export function __resetPendingAssignReaderForTests(): void {
  pendingAssignReader = null;
}
