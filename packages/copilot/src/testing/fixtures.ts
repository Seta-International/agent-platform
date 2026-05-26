// Test-only surface. Integration tests that need to spin up a Mastra runtime
// outside the normal `registerCopilot` boot path import from here instead of
// reaching for engine internals. Production code never touches this subpath.

import { MockLanguageModelV3 } from 'ai/test';

export type { ModelTier } from '../backend/model-registry.ts';
export { resolveModel } from '../backend/model-registry.ts';
export type { CopilotRuntimeDeps } from '../backend/runtime.ts';
export { buildMastra } from '../backend/runtime.ts';
export { buildAgentFromSpec } from '../register.ts';

// A no-op language model suitable for `buildAgentFromSpec`. Tests that mock
// `agent.generate` never actually invoke the model, so this lets orchestrator
// integration tests avoid taking a direct dependency on `ai/test`.
export function mockLanguageModel(): unknown {
  return new MockLanguageModelV3();
}

export { resetCopilotDb } from '../backend/db/index.ts';
