import type { MastraModelConfig } from '@mastra/core/llm';

export type ModelTier = 'fast' | 'balanced' | 'reasoning';
const TIERS: ReadonlySet<string> = new Set(['fast', 'balanced', 'reasoning']);

const KNOWN_CLOUD_PROVIDERS: ReadonlySet<string> = new Set([
  'openai',
  'anthropic',
  'google',
  'xai',
  'groq',
]);

export interface ModelEntry {
  /** Stable selection key shown to clients, e.g. "openai/gpt-5.5". */
  key: string;
  label: string;
  tier: ModelTier;
  providerId: string;
  /** Value assignable to a Mastra Agent's model option. */
  model: MastraModelConfig;
}

export function providerEnvVars(providerId: string): { apiKey: string; baseUrl: string } {
  const upper = providerId.toUpperCase().replace(/-/g, '_');
  return { apiKey: `${upper}_API_KEY`, baseUrl: `${upper}_BASE_URL` };
}

/** Split a raw catalog token "provider/model[:tier]" into a typed entry. */
export function parseModelEntry(raw: string, env: Record<string, string | undefined>): ModelEntry {
  const trimmed = raw.trim();
  let tier: ModelTier = 'balanced';
  let id = trimmed;

  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon > -1) {
    const suffix = trimmed.slice(lastColon + 1);
    if (TIERS.has(suffix)) {
      tier = suffix as ModelTier;
      id = trimmed.slice(0, lastColon);
    }
  }

  const slash = id.indexOf('/');
  if (slash <= 0 || slash === id.length - 1) {
    throw new Error(`AGENT_MODELS entry must be "provider/model", got "${raw}"`);
  }
  const providerId = id.slice(0, slash);
  const modelId = id.slice(slash + 1);

  if (providerId === 'mock') {
    return { key: id, label: `mock · ${modelId}`, tier, providerId, model: id };
  }

  const { baseUrl, apiKey } = providerEnvVars(providerId);
  const url = env[baseUrl];
  if (url) {
    // Self-hosted / unknown provider: build an explicit openai-compatible config.
    return {
      key: id,
      label: id,
      tier,
      providerId,
      model: { providerId, modelId, url, apiKey: env[apiKey] ?? '' },
    };
  }

  return { key: id, label: id, tier, providerId, model: id };
}

/** Validate that every provider referenced by AGENT_MODELS + EMBED_MODEL has its key. */
export function validateModelEnv(env: Record<string, string | undefined>): void {
  const ids = [
    ...(env.AGENT_MODELS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    env.EMBED_MODEL?.trim() ?? '',
  ].filter(Boolean);

  const providers = new Set<string>();
  for (const id of ids) {
    const entry = parseModelEntry(id, env);
    if (entry.providerId !== 'mock') providers.add(entry.providerId);
  }

  const missing: string[] = [];
  for (const providerId of providers) {
    const { apiKey, baseUrl } = providerEnvVars(providerId);
    if (env[baseUrl]) continue; // self-host: key optional
    if (KNOWN_CLOUD_PROVIDERS.has(providerId)) {
      if (!env[apiKey]) missing.push(apiKey);
    } else if (!env[apiKey]) {
      // unknown provider with neither key nor base url
      missing.push(`${apiKey} (or ${baseUrl})`);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing model provider env vars: ${missing.join(', ')}`);
  }
}
