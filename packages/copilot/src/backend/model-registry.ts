import { openai } from '@ai-sdk/openai';
import { MockLanguageModelV3 } from 'ai/test';
import { copilotEnv } from './env.ts';

export type ModelTier = 'fast' | 'balanced' | 'reasoning';

export interface ModelEntry {
  key: string;
  label: string;
  tier: ModelTier;
  supportsReasoning: boolean;
  resolve: () => ReturnType<typeof openai>;
}

const KNOWN_OPENAI_MODELS: Record<string, Omit<ModelEntry, 'resolve'>> = {
  'gpt-5.5': {
    key: 'openai/gpt-5.5',
    label: 'GPT-5.5',
    tier: 'balanced',
    supportsReasoning: true,
  },
  'gpt-5.5-pro': {
    key: 'openai/gpt-5.5-pro',
    label: 'GPT-5.5 Pro',
    tier: 'reasoning',
    supportsReasoning: true,
  },
  'gpt-5.4': {
    key: 'openai/gpt-5.4',
    label: 'GPT-5.4',
    tier: 'balanced',
    supportsReasoning: false,
  },
  'gpt-5.4-mini': {
    key: 'openai/gpt-5.4-mini',
    label: 'GPT-5.4 mini',
    tier: 'fast',
    supportsReasoning: false,
  },
  'gpt-5.4-nano': {
    key: 'openai/gpt-5.4-nano',
    label: 'GPT-5.4 nano',
    tier: 'fast',
    supportsReasoning: false,
  },
  'gpt-5-mini': {
    key: 'openai/gpt-5-mini',
    label: 'GPT-5 mini',
    tier: 'fast',
    supportsReasoning: false,
  },
  'gpt-5-nano': {
    key: 'openai/gpt-5-nano',
    label: 'GPT-5 nano',
    tier: 'fast',
    supportsReasoning: false,
  },
  o3: {
    key: 'openai/o3',
    label: 'o3 (reasoning)',
    tier: 'reasoning',
    supportsReasoning: true,
  },
  'o4-mini': {
    key: 'openai/o4-mini',
    label: 'o4-mini (reasoning)',
    tier: 'reasoning',
    supportsReasoning: true,
  },
  'gpt-4.1': {
    key: 'openai/gpt-4.1',
    label: 'GPT-4.1 (legacy)',
    tier: 'balanced',
    supportsReasoning: false,
  },
  'gpt-4o-mini': {
    key: 'openai/gpt-4o-mini',
    label: 'GPT-4o mini (legacy)',
    tier: 'fast',
    supportsReasoning: false,
  },
};

const FALLBACK_IDS = ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.5', 'o4-mini'] as const;

const FALLBACK_CATALOG: ModelEntry[] = FALLBACK_IDS.map((id) => {
  const meta = KNOWN_OPENAI_MODELS[id];
  if (!meta) throw new Error(`Fallback id ${id} missing from KNOWN_OPENAI_MODELS`);
  return { ...meta, resolve: () => openai(id) };
});

function parseCatalog(raw: string | undefined): ModelEntry[] | null {
  if (!raw) return null;
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return null;
  const out: ModelEntry[] = [];
  for (const id of ids) {
    const slash = id.indexOf('/');
    if (slash < 0) throw new Error(`COPILOT_MODELS entry must be 'provider/model', got "${id}"`);
    const provider = id.slice(0, slash);
    const name = id.slice(slash + 1);
    if (provider === 'openai') {
      const meta = KNOWN_OPENAI_MODELS[name] ?? {
        key: id,
        label: name,
        tier: 'balanced' as const,
        supportsReasoning: name.startsWith('o'),
      };
      out.push({ ...meta, resolve: () => openai(name) });
    } else if (provider === 'mock') {
      out.push({
        key: id,
        label: `mock · ${name}`,
        tier: 'fast',
        supportsReasoning: false,
        resolve: () => new MockLanguageModelV3() as unknown as ReturnType<typeof openai>,
      });
    } else {
      throw new Error(`Unsupported COPILOT_MODELS provider: ${provider} (supported: openai, mock)`);
    }
  }
  return out;
}

let cachedCatalog: ModelEntry[] | null = null;
let cachedDefaultKey: string | null = null;

function loadCatalog(): { entries: ModelEntry[]; defaultKey: string } {
  if (cachedCatalog && cachedDefaultKey) {
    return { entries: cachedCatalog, defaultKey: cachedDefaultKey };
  }
  const fromEnv = parseCatalog(copilotEnv.COPILOT_MODELS);
  const entries = fromEnv ?? parseCatalog(copilotEnv.COPILOT_MODEL) ?? FALLBACK_CATALOG;
  const defaultKey = copilotEnv.COPILOT_MODEL_DEFAULT ?? 'auto';
  cachedCatalog = entries;
  cachedDefaultKey = defaultKey;
  return { entries, defaultKey };
}

export interface ResolveOpts {
  lastUserText?: string;
  tierHint?: ModelTier;
}

export function listModels(): { models: PublicModel[]; default: string } {
  const { entries, defaultKey } = loadCatalog();
  return {
    models: entries.map((e) => ({
      key: e.key,
      label: e.label,
      tier: e.tier,
      supportsReasoning: e.supportsReasoning,
    })),
    default: defaultKey,
  };
}

export interface PublicModel {
  key: string;
  label: string;
  tier: ModelTier;
  supportsReasoning: boolean;
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

export function resolveModel(
  key: string | undefined,
  opts: ResolveOpts = {},
): { entry: ModelEntry; model: ReturnType<typeof openai> } {
  const { entries, defaultKey } = loadCatalog();
  const requested = key ?? defaultKey;
  if (requested === 'auto') {
    const entry = pickAuto(entries, opts);
    return { entry, model: entry.resolve() };
  }
  const entry = entries.find((e) => e.key === requested);
  if (!entry) {
    throw new ModelNotFoundError(requested);
  }
  return { entry, model: entry.resolve() };
}

export class ModelNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`Unknown model key: ${key}`);
    this.name = 'ModelNotFoundError';
  }
}
