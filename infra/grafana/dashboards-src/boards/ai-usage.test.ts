import { describe, expect, it } from 'vitest';
import { buildAiUsage } from './ai-usage';

describe('ai usage board', () => {
  const d = buildAiUsage().build();
  // biome-ignore lint/suspicious/noExplicitAny: panel shape is Grafana JSON.
  const panels = (d.panels ?? []) as any[];
  const json = JSON.stringify(panels);

  it('uid + developer picker sourced from the session counter', () => {
    expect(d.uid).toBe('ai-usage');
    expect(JSON.stringify(d.templating)).toContain(
      'label_values(claude_code_session_count_total, dev)',
    );
  });

  it('uses the Prometheus-translated metric names, not the raw OTel ones', () => {
    // Prometheus rewrites `claude_code.cost.usage` per translation_strategy; a dot here
    // means the board was written against the OTLP name and would render empty.
    expect(json).not.toMatch(/claude_code\.\w/);
    for (const m of [
      'claude_code_cost_usage_USD_total',
      'claude_code_token_usage_tokens_total',
      'claude_code_session_count_total',
      'claude_code_active_time_seconds_total',
    ]) {
      expect(json).toContain(m);
    }
  });

  it('attributes by the git identity, never the shared account email', () => {
    expect(json).toContain('dev_email');
    // The team shares one Claude login, so user_email is identical for everyone and would
    // silently collapse every per-person panel into a single series.
    expect(json).not.toContain('user_email');
  });

  it('covers spend, adoption, cost drivers and working patterns', () => {
    const titles = panels.map((p) => p.title);
    expect(titles).toContain('Spend, last 30d');
    expect(titles).toContain('Spend per active developer, 30d');
    expect(titles).toContain('Active developers per day');
    expect(titles).toContain('Daily spend by model');
    expect(titles).toContain('Sessions by surface');
  });

  it('answers who uses it well, per person rather than team-wide', () => {
    const titles = panels.map((p) => p.title);
    expect(titles).toContain('Cache read share by developer');
    expect(titles).toContain('Cost per session by developer');
    expect(titles).toContain('Spend per active hour by developer');
    // Every per-head ratio must group by dev_email on BOTH sides, or Prometheus drops the
    // series on a many-to-one match and the panel silently renders empty.
    const ratios = [
      'Cache read share by developer',
      'Cost per session by developer',
      'Spend per active hour by developer',
    ];
    for (const t of panels.filter((p) => ratios.includes(p.title))) {
      for (const target of t.targets ?? []) {
        const halves = target.expr.split('/').filter((h: string) => h.includes('increase('));
        expect(halves.length).toBeGreaterThan(1);
        for (const half of halves) expect(half).toContain('by (dev_email)');
      }
    }
  });

  it('converts active time from seconds to hours', () => {
    expect(json).toContain('/ 3600');
  });
});
