import { describe, expect, it } from 'vitest';
import { buildLlmGpu } from './llm-gpu';

describe('llm & gpu', () => {
  const d = buildLlmGpu().build();
  it('uid, no vllm, agent + dcgm present', () => {
    expect(d.uid).toBe('llm-gpu');
    const json = JSON.stringify(d);
    expect(json).not.toContain('vllm');
    expect(json).toContain('agent_llm_ttft_seconds_bucket');
    expect(json).toContain('DCGM_FI_DEV_GPU_UTIL');
  });
  it('tenant + model variables', () => {
    const t = JSON.stringify(d.templating);
    expect(t).toContain('label_values(agent_llm_output_tokens_total, tenant)');
    expect(t).toContain('label_values(agent_llm_output_tokens_total, model)');
  });
});
