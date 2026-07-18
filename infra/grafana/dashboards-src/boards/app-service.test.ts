import { describe, expect, it } from 'vitest';
import { buildAppService } from './app-service';

describe('app service', () => {
  const d = buildAppService().build();
  it('uid + env picker sourced from node_uname_info (not raw up)', () => {
    expect(d.uid).toBe('app-service');
    const vars = JSON.stringify(d.templating);
    expect(vars).toContain('label_values(node_uname_info, env)');
    expect(vars).not.toContain('label_values(up, env)');
  });
  it('has RED panels and a latency heatmap', () => {
    const titles = (d.panels ?? []).map((p: { title?: string }) => p.title);
    expect(titles).toContain('Request rate by status');
    expect(titles).toContain('5xx error ratio');
    expect(titles).toContain('Latency distribution');
  });
});
