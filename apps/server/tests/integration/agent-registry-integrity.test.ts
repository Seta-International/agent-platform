import { AgentRegistry, SpecializedAgentRegistry } from '@seta/agent-sdk';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { composeRegistries } from '../../src/compose-registries.ts';
import { testComposeDeps } from '../helpers/compose.ts';

// Cross-module safety gate: composeRegistries() is the one place every module's
// specialists, cross-module read tools, and orchestration specs land before the
// registries freeze. This test drives that same composition in-process (no HTTP,
// no worker, no DB) and asserts nothing two modules contributed collides.
beforeAll(() => {
  // Deliberately NOT calling AgentRegistry.__resetForTests() here: its
  // specialists/cross-module read tools/workflows come from each module's
  // agent-tools/register.ts side-effect import (wired transitively through
  // composeRegistries' `import '@seta/agent/register'`), which — like any ES
  // module — runs exactly once per module graph, before this beforeAll ever
  // executes. Resetting would wipe that one-shot population with no way to
  // re-trigger it, freezing an empty registry. Vitest gives this test file
  // its own fresh module graph, so AgentRegistry already starts empty and
  // unfrozen; composeRegistries() only needs to freeze it.
  SpecializedAgentRegistry.__resetForTests();
  composeRegistries(testComposeDeps());
});

describe('agent registry integrity', () => {
  // Guards against the gate silently passing vacuously (e.g. a composition
  // bug that freezes empty registries would make every check below trivially
  // true, and this test would prove nothing).
  it('registries are non-trivially populated', () => {
    const { specialists, crossReadTools, workflows } = AgentRegistry.snapshot();
    expect(specialists.length).toBeGreaterThan(0);
    expect(crossReadTools.length).toBeGreaterThan(0);
    expect(workflows.length).toBeGreaterThan(0);
    expect(SpecializedAgentRegistry.snapshot().length).toBeGreaterThan(0);
  });

  it('specialist ids are globally unique', () => {
    const ids = SpecializedAgentRegistry.snapshot().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every specialist has valid I/O schemas', () => {
    for (const spec of SpecializedAgentRegistry.snapshot()) {
      expect(spec.inputSchema).toBeInstanceOf(z.ZodType);
      expect(spec.outputSchema).toBeInstanceOf(z.ZodType);
    }
  });

  it('cross-module read-tool ids and RBAC slugs are unique', () => {
    const { crossReadTools } = AgentRegistry.snapshot();
    const ids = crossReadTools.map((t) => t.id);
    const slugs = crossReadTools.map((t) => t.rbac);
    expect(new Set(ids).size).toBe(ids.length);
    expect(slugs.every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
  });

  it('cross-module read tools resolve their audience', () => {
    const specialistIds = new Set(AgentRegistry.snapshot().specialists.map((s) => s.id));
    for (const tool of AgentRegistry.snapshot().crossReadTools) {
      if (tool.availableTo === 'all-specialists') continue;
      for (const target of tool.availableTo) {
        expect(specialistIds.has(target)).toBe(true);
      }
    }
  });
});
