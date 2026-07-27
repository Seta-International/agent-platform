import { describe, expect, it } from 'vitest';
import { buildContainer } from './container';

describe('container', () => {
  const d = buildContainer().build();

  it('uid + container variable sourced from cAdvisor identity metric, hardcoded to prod', () => {
    expect(d.uid).toBe('container');
    expect(JSON.stringify(d.templating)).toContain('label_values(container_last_seen, name)');
    expect(JSON.stringify(d.panels)).toContain('env=\\"prod\\"');
    expect(JSON.stringify(d.templating)).not.toContain('$env');
  });

  it('rate panels set a 15s Min step so $__rate_interval shrinks to ~1m for burst visibility', () => {
    const rateTargets = (d.panels ?? [])
      .flatMap((p: { targets?: { expr?: string; interval?: string }[] }) => p.targets ?? [])
      .filter((t) => t.expr?.includes('rate('));
    expect(rateTargets.length).toBe(5);
    expect(rateTargets.every((t) => t.interval === '15s')).toBe(true);
    // increase()/instant panels must NOT get the Min step.
    const nonRate = (d.panels ?? [])
      .flatMap((p: { targets?: { expr?: string; interval?: string }[] }) => p.targets ?? [])
      .filter((t) => t.expr && !t.expr.includes('rate('));
    expect(nonRate.every((t) => t.interval === undefined)).toBe(true);
  });

  it('has CPU/mem/disk-io/network-io panels', () => {
    const titles = (d.panels ?? []).map((p: { title?: string }) => p.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        'CPU usage (% of 1 core) by container',
        'Memory working set by container',
        'Disk read bytes/sec by container',
        'Disk write bytes/sec by container',
        'Network receive bytes/sec by container',
        'Network transmit bytes/sec by container',
      ]),
    );
  });
});
