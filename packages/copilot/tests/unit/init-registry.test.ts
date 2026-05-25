import { CopilotRegistry } from '@seta/copilot-sdk';
import { describe, expect, it } from 'vitest';

// Import init-registry AFTER the registry import so side-effects fire with the
// registry in its initial (unfrozen, empty) state.  Node module caching means
// these side-effect registrations run exactly once for the whole test process;
// we must NOT call __resetForTests() before asserting on specialists because that
// would clear what the cached modules already registered.
import { initCopilotRegistry } from '../../src/backend/init-registry';

describe('initCopilotRegistry', () => {
  it('freezes the registry exactly once and imports module-side-effect registrations (planner, identity, self, meta)', () => {
    // Side-effect imports in init-registry.ts already fired at module-load time.
    // Call initCopilotRegistry() to freeze (idempotent if frozen by a prior run in
    // the same vitest worker process).
    initCopilotRegistry();
    expect(CopilotRegistry.isFrozen()).toBe(true);

    // Idempotent: a second call is a no-op, does not throw.
    expect(() => initCopilotRegistry()).not.toThrow();

    const snap = CopilotRegistry.snapshot();
    expect(snap.domains).toEqual(expect.arrayContaining(['work', 'people', 'self', 'meta']));
    expect(snap.specialists.some((s) => s.id === 'planner')).toBe(true);
    expect(snap.specialists.some((s) => s.id === 'identity')).toBe(true);
    expect(snap.specialists.some((s) => s.id === 'self')).toBe(true);
    expect(snap.specialists.some((s) => s.id === 'meta')).toBe(true);
  });
});
