import { describe, expect, it } from 'vitest';
import { buildLogs } from './logs';

describe('logs', () => {
  const d = buildLogs().build();
  it('uid + loki datasource + error-rate panel', () => {
    expect(d.uid).toBe('logs');
    const json = JSON.stringify(d);
    expect(json).toContain('level=error');
    expect(json).toContain('"uid":"loki"');
  });
});
