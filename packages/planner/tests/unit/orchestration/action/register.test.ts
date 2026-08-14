import { describe, expect, it } from 'vitest';
import { buildPlannerActionRuntime } from '../../../../src/backend/orchestration/action/register.ts';

describe('buildPlannerActionRuntime', () => {
  // The runtime is composed at module load in some entrypoints, long before any
  // request has a live embedding provider. Reading either dep eagerly would turn
  // a composition into a crash.
  it('composes without touching embeddingProvider or databaseUrl', () => {
    let touched = false;
    expect(() =>
      buildPlannerActionRuntime({
        resolveModel: () => ({}) as never,
        mastraStorage: {} as never,
        embeddingProvider: {
          get dimensions(): number {
            touched = true;
            return 0;
          },
          embed: () => {
            touched = true;
            return Promise.resolve([]);
          },
        } as never,
        previewPort: {
          loadPreview: async () => null,
          takenDedupKeys: async () => [],
        },
        get databaseUrl(): string {
          touched = true;
          return '';
        },
      }),
    ).not.toThrow();
    expect(touched).toBe(false);
  });
});
