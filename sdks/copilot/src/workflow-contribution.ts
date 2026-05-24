import type { ZodType } from 'zod';
import type { WorkflowBuilder } from './workflow-builder.ts';

// A workflow contribution bundles the Mastra workflow registration with the
// metadata copilot needs to surface it (currently: the runtime input schema).
// The copilot engine invokes `build(mastra)` to register the workflow on
// Mastra, then — if `inputSchema` is present — exposes that schema via the
// chat-route's runtime input-validation registry keyed by `id`. Keeping both
// concerns in one record means orchestrator modules never reach into
// copilot's internal input-schema-registry directly.
export interface WorkflowContribution {
  /** Mastra workflow id (matches the id passed to createWorkflow). */
  id: string;
  build: WorkflowBuilder;
  inputSchema?: ZodType;
}
