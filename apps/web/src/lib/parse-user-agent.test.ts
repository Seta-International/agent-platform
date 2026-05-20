import { describe, expect, it } from 'vitest';
import { parseUserAgent } from './parse-user-agent.ts';

describe('parseUserAgent', () => {
  it('parses Chrome on macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    expect(parseUserAgent(ua)).toEqual({ browser: 'Chrome', os: 'macOS' });
  });
  it('parses Firefox on Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0';
    expect(parseUserAgent(ua)).toEqual({ browser: 'Firefox', os: 'Windows' });
  });
  it('parses Edge over Chrome', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0';
    expect(parseUserAgent(ua).browser).toBe('Edge');
  });
  it('returns Unknown for malformed input', () => {
    expect(parseUserAgent('weird-ua/1.0').browser).toBe('Unknown');
    expect(parseUserAgent(null)).toEqual({ browser: 'Unknown', os: 'Unknown' });
    expect(parseUserAgent('')).toEqual({ browser: 'Unknown', os: 'Unknown' });
  });
});
