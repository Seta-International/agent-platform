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
});
