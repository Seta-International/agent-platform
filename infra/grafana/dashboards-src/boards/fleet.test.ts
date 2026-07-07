import { describe, expect, it } from 'vitest';
import { buildFleet } from './fleet';

describe('fleet overview', () => {
  const d = buildFleet().build();
  it('has the canonical uid', () => expect(d.uid).toBe('fleet-overview'));
  it('shows per-env error ratio as a percent', () => {
    const titles = (d.panels ?? []).map((p: any) => p.title);
    expect(titles).toContain('5xx error ratio');
  });
  it('computes error ratio, not raw rate', () => {
    const json = JSON.stringify(d.panels);
    expect(json).toContain('/ sum by (env)(rate(http_server_duration_count');
    expect(json).not.toContain('vllm');
  });
  it('uses UP/DOWN mappings for availability', () => {
    expect(JSON.stringify(d.panels)).toContain('DOWN');
  });
});
