import { AgentRegistry } from '@seta/agent-sdk';
import type { Hono } from 'hono';
import { listModels } from '../model-registry.ts';
import { type AgentRouteDeps, type AgentRouteEnv, checkPerm } from './_shared.ts';

export function mountCatalogRoutes(app: Hono<AgentRouteEnv>, deps: AgentRouteDeps): void {
  app.get('/api/agent/v1/tools', async (c) => {
    const check = checkPerm(
      c.get('session') as import('../types.ts').SessionLike | undefined,
      'agent.chat.use',
    );
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const snap = AgentRegistry.snapshot();
    const seen = new Set<string>();
    const tools: Array<{ id: string; name: string; description: string }> = [];
    for (const s of snap.specialists) {
      for (const [id, tool] of Object.entries(s.tools)) {
        if (seen.has(id)) continue;
        seen.add(id);
        const meta = tool as { description?: string; displayName?: string };
        tools.push({
          id,
          name: meta.displayName ?? id,
          description: meta.description ?? '',
        });
      }
    }
    return c.json({ tools });
  });

  app.get('/api/agent/v1/agents', async (c) => {
    const check = checkPerm(
      c.get('session') as import('../types.ts').SessionLike | undefined,
      'agent.chat.use',
    );
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const snap = AgentRegistry.snapshot();
    // Include domain names (used by top supervisor) AND specialist IDs (used by
    // domain supervisors when called directly). Both appear as `agent-<name>`
    // tool calls in the stream and need a renderer registered on the client.
    const seen = new Set<string>();
    const agents: Array<{ name: string; label: string }> = [];
    for (const d of snap.domains) {
      if (!seen.has(d)) {
        seen.add(d);
        agents.push({ name: d, label: d.charAt(0).toUpperCase() + d.slice(1) });
      }
    }
    for (const s of snap.specialists) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        agents.push({ name: s.id, label: s.id.charAt(0).toUpperCase() + s.id.slice(1) });
      }
    }
    return c.json({ agents });
  });

  app.get('/api/agent/v1/models', async (c) => {
    const check = checkPerm(
      c.get('session') as import('../types.ts').SessionLike | undefined,
      'agent.chat.use',
    );
    if (!check.ok) return c.json(check.denied.body, check.denied.status);
    const { models, default: defaultKey } = listModels();
    const withAuto = [
      {
        key: 'auto',
        label: 'Auto',
        tier: 'auto' as const,
        supportsReasoning: models.some((m) => m.supportsReasoning),
      },
      ...models,
    ];
    return c.json({ models: withAuto, default: defaultKey });
  });

  app.get('/api/agent/v1/health', async (c) => {
    const modelConfigured = listModels().models.length > 0;
    let dbReachable = true;
    const storage = (deps.mastra as { getStorage: () => unknown }).getStorage();
    try {
      const maybePing = (storage as { ping?: () => Promise<void> } | null)?.ping;
      if (typeof maybePing === 'function') {
        await maybePing.call(storage);
      } else if (
        storage &&
        typeof (storage as { init?: () => Promise<void> }).init === 'function'
      ) {
        await (storage as { init: () => Promise<void> }).init();
      }
    } catch {
      dbReachable = false;
    }
    return c.json({
      status: modelConfigured && dbReachable ? 'ok' : 'degraded',
      model: { configured: modelConfigured },
      db: { reachable: dbReachable },
      mastra: { initialized: Boolean(storage) },
    });
  });
}
