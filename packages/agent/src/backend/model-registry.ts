import type { MastraModelConfig } from '@mastra/core/llm';
import { MockLanguageModelV3 } from 'ai/test';
import { agentEnv } from './env.ts';
import { type ModelEntry, type ModelTier, parseModelEntry } from './provider-config.ts';

export type { ModelTier } from './provider-config.ts';

export interface PublicModel {
  key: string;
  label: string;
  tier: ModelTier;
  providerId: string;
  supportsReasoning: boolean;
}

const DEFAULT_CATALOG_RAW = 'openai/gpt-5.5:balanced';

function buildCatalog(raw: string | undefined): ModelEntry[] {
  const tokens = (raw ?? DEFAULT_CATALOG_RAW)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const source = tokens.length > 0 ? tokens : [DEFAULT_CATALOG_RAW];
  return source.map((t) => parseModelEntry(t, process.env));
}

let cachedCatalog: ModelEntry[] | null = null;
let cachedDefaultKey: string | null = null;

function loadCatalog(): { entries: ModelEntry[]; defaultKey: string } {
  if (cachedCatalog && cachedDefaultKey)
    return { entries: cachedCatalog, defaultKey: cachedDefaultKey };
  cachedCatalog = buildCatalog(agentEnv.AGENT_MODELS);
  cachedDefaultKey = agentEnv.AGENT_MODEL_DEFAULT ?? 'auto';
  return { entries: cachedCatalog, defaultKey: cachedDefaultKey };
}

export interface ResolveOpts {
  lastUserText?: string;
  tierHint?: ModelTier;
}

const REASONING_HINTS = /\b(step[\s-]by[\s-]step|explain|analyze|reason|prove|why\b|how\b)/i;

function pickAuto(entries: ModelEntry[], opts: ResolveOpts): ModelEntry {
  const first = entries[0];
  if (!first) throw new Error('Model catalog is empty');
  const fast = entries.find((e) => e.tier === 'fast');
  const reasoning = entries.find((e) => e.tier === 'reasoning');
  const balanced = entries.find((e) => e.tier === 'balanced');

  if (opts.tierHint === 'fast') return fast ?? first;
  if (opts.tierHint === 'reasoning' && reasoning) return reasoning;
  if (opts.tierHint === 'balanced' && balanced) return balanced;

  const text = opts.lastUserText ?? '';
  const looksHard = text.length > 240 || REASONING_HINTS.test(text);
  if (looksHard && reasoning) return reasoning;
  return fast ?? balanced ?? first;
}

function materialize(entry: ModelEntry): MastraModelConfig {
  if (entry.providerId === 'mock') return new MockLanguageModelV3() as unknown as MastraModelConfig;
  return entry.model;
}

export function listModels(): { models: PublicModel[]; default: string } {
  const { entries, defaultKey } = loadCatalog();
  return {
    models: entries.map((e) => ({
      key: e.key,
      label: e.label,
      tier: e.tier,
      providerId: e.providerId,
      supportsReasoning: e.tier === 'reasoning',
    })),
    default: defaultKey,
  };
}

export function resolveModel(
  key: string | undefined,
  opts: ResolveOpts = {},
): { entry: ModelEntry; model: MastraModelConfig } {
  const { entries, defaultKey } = loadCatalog();
  const requested = key ?? defaultKey;
  if (requested === 'auto') {
    const entry = pickAuto(entries, opts);
    return { entry, model: materialize(entry) };
  }
  const entry = entries.find((e) => e.key === requested);
  if (!entry) throw new ModelNotFoundError(requested);
  return { entry, model: materialize(entry) };
}

export class ModelNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`Unknown model key: ${key}`);
    this.name = 'ModelNotFoundError';
  }
}
