import { describe, expect, it } from 'vitest';
import { buildHost } from './host';

describe('host', () => {
  const d = buildHost().build();
  it('uid + env from node_uname_info', () => {
    expect(d.uid).toBe('host');
    expect(JSON.stringify(d.templating)).toContain('label_values(node_uname_info, env)');
  });
  it('has CPU/mem/disk gauges and a disk-free SLO trend', () => {
    const titles = (d.panels ?? []).map((p: { title?: string }) => p.title);
    expect(titles).toEqual(
      expect.arrayContaining(['CPU busy', 'Memory used', 'Disk free (min mount)']),
    );
  });
  it('CPU busy aggregates by env, not instance (instance is identical across envs)', () => {
    const json = JSON.stringify(d.panels);
    expect(json).toContain('avg by (env)(rate(node_cpu_seconds_total');
    expect(json).not.toContain('avg by (instance)');
  });
  it('has a Disk I/O trend built on node_disk counters', () => {
    const titles = (d.panels ?? []).map((p: { title?: string }) => p.title);
    expect(titles).toContain('Disk I/O');
    expect(JSON.stringify(d.panels)).toContain('node_disk_read_bytes_total');
    expect(JSON.stringify(d.panels)).toContain('node_disk_written_bytes_total');
  });
});
