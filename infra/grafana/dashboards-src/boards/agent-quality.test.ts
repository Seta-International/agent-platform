import { describe, expect, it } from 'vitest';
import { buildAgentQuality } from './agent-quality';

describe('agent quality board', () => {
  const d = buildAgentQuality().build();
  it('uid + env picker sourced from agent_eval_score', () => {
    expect(d.uid).toBe('agent-quality');
    expect(JSON.stringify(d.templating)).toContain('label_values(agent_eval_score, env)');
  });
  it('has the score trend and the freshness stat', () => {
    // biome-ignore lint/suspicious/noExplicitAny: panel shape is Grafana JSON.
    const titles = (d.panels ?? []).map((p: any) => p.title);
    expect(titles).toContain('Score by specialist × scorer');
    expect(titles).toContain('Last eval run age');
  });
  it('references both agent-eval metrics', () => {
    const json = JSON.stringify(d.panels);
    expect(json).toContain('agent_eval_score');
    expect(json).toContain('agent_eval_last_run_timestamp_seconds');
  });
});
