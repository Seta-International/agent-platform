import type { MastraModelConfig } from '@mastra/core/llm';
import { MockLanguageModelV3 } from 'ai/test';
import { EvaluationError } from '../rbac.ts';

function providerOf(spec: string): string {
  const provider = spec.split('/')[0];
  if (!provider) throw new EvaluationError('VALIDATION', `Invalid model spec: '${spec}'`);
  return provider;
}

/**
 * Resolve a `provider/model` spec to a MastraModelConfig.
 * - mock/*       → MockLanguageModelV3 (offline tests)
 * - self-hosted  → { id, url, apiKey } when <PROVIDER>_BASE_URL is set
 * - cloud        → the spec string itself; Mastra's ModelRouter resolves it
 *                  from <PROVIDER>_API_KEY.
 */
export function resolveModel(spec: string): MastraModelConfig {
  const provider = providerOf(spec);
  if (provider === 'mock') {
    return new MockLanguageModelV3() as unknown as MastraModelConfig;
  }
  const baseUrl = process.env[`${provider.toUpperCase()}_BASE_URL`];
  if (baseUrl) {
    const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`] ?? '';
    return { id: spec, url: baseUrl, apiKey } as unknown as MastraModelConfig;
  }
  return spec as unknown as MastraModelConfig;
}

/** Fail fast at createRun time if the spec cannot be resolved from current env. */
export function validateModelSpec(spec: string): void {
  const provider = providerOf(spec);
  if (provider === 'mock') return;
  const hasKey = Boolean(process.env[`${provider.toUpperCase()}_API_KEY`]);
  const hasBaseUrl = Boolean(process.env[`${provider.toUpperCase()}_BASE_URL`]);
  if (!hasKey && !hasBaseUrl) {
    throw new EvaluationError(
      'VALIDATION',
      `No credentials for provider '${provider}'. Set ${provider.toUpperCase()}_API_KEY (or _BASE_URL for self-hosted).`,
      { spec },
    );
  }
}
