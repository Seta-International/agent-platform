// Workflow builders are passed an opaque Mastra instance and register workflows on it.
// Typed as `unknown` to keep @mastra/core out of consumers' resolved type graph.
// Orchestrators (staffing) author functions of this shape; @seta/core's registry
// collects them and the copilot engine invokes them at runtime.
export type WorkflowBuilder = (mastra: unknown) => unknown;
