// packages/core/src/flags/test-support.ts
// Test helper: wires SetaFeatureProvider into OpenFeature and sets the catalog.
// Import via `@seta/core/testing` — not for production use.
import { OpenFeature } from '@openfeature/server-sdk';
import { getEffectiveFlag } from './cache.ts';
import { setFlagCatalog } from './catalog.ts';
import { SetaFeatureProvider } from './provider.ts';
import type { FlagDef } from './types.ts';

/**
 * Sets the flag catalog and registers the SetaFeatureProvider so that
 * resolveFeatures works correctly in integration tests.
 * Always call resetFlagCache() in afterEach / finally.
 */
export async function initFlagsForTest(defs: FlagDef[]): Promise<void> {
  setFlagCatalog(defs);
  await OpenFeature.setProviderAndWait(new SetaFeatureProvider({ getEffectiveFlag }));
}
