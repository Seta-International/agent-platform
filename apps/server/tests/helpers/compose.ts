import { InMemoryStore } from '@mastra/core/storage';
import type { AssignmentPorts } from '@seta/planner/orchestration';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import type { ComposeDeps } from '../../src/compose-registries.ts';

/**
 * Fake/no-op runtime deps for `composeRegistries()` in tests. Mirrors what
 * apps/server/src/index.ts passes at boot, minus any live model/embedding
 * provider — the registry-integrity checks only inspect registered specs
 * (ids, schemas, RBAC slugs), they never call `.run`/`.embed`, so stubs that
 * throw if actually invoked are safe here and double as a tripwire if a
 * future test starts exercising the runtimes for real.
 */
export function testComposeDeps(): ComposeDeps {
  const embeddingProvider: EmbeddingProvider = {
    modelId: 'test/unused-embedding-model',
    dimensions: 1,
    embed: () => {
      throw new Error('testComposeDeps: embed() should never be called by the integrity gate');
    },
  };

  // Registration-only: composeRegistries()/buildAssignmentOrchestrationRuntime
  // only reads these to build + register the orchestrator agent's tool
  // closures; the gate never invokes `.run` on any of them, so throwing stubs
  // are safe here and double as a tripwire if a future test starts exercising
  // the assignment runtime for real.
  const throwing =
    (name: string) =>
    (..._args: unknown[]) => {
      throw new Error(`testComposeDeps: ${name} should never be called by the gate`);
    };

  const assignmentPorts: AssignmentPorts = {
    taskReader: { load: throwing('taskReader.load') },
    taskSearch: {
      byLabels: throwing('taskSearch.byLabels'),
      listAvailableLabels: throwing('taskSearch.listAvailableLabels'),
    },
    skillSearch: { search: throwing('skillSearch.search') },
    availability: {
      status: throwing('availability.status'),
      inProgressCount: throwing('availability.inProgressCount'),
    },
    userProfileLookup: { findByName: throwing('userProfileLookup.findByName') },
    assign: { assign: throwing('assign.assign') },
    taskAssignees: { currentAssigneeIds: throwing('taskAssignees.currentAssigneeIds') },
  };

  return {
    resolveModel: () => ({}) as never,
    embeddingProvider,
    assignmentPorts,
    // Registration-only; register.test.ts uses `repo: {} as never` for the
    // same reason — the gate never touches run-state persistence.
    assignmentRepo: {} as never,
    mastraStorage: new InMemoryStore(),
    actionPreviewPort: {
      loadPreview: async () => {
        throw new Error('testComposeDeps: loadPreview should never be called by the gate');
      },
      takenDedupKeys: async () => {
        throw new Error('testComposeDeps: takenDedupKeys should never be called by the gate');
      },
    },
  };
}
