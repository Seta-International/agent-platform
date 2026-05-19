import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hibpCheck } from '../src/backend/password/hibp.ts';

describe('hibpCheck', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when the suffix is in the returned list', async () => {
    // SHA-1 of 'password' = '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8'
    // Prefix = '5BAA6', suffix = '1E4C9B93F3F0682250B6CF8331B7EE68FD8'
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => '1E4C9B93F3F0682250B6CF8331B7EE68FD8:9876543\nOTHER:1',
    } as Response);
    expect(await hibpCheck('password')).toBe(true);
  });

  it('returns false when the suffix is not present', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => 'AAA:1\nBBB:2',
    } as Response);
    expect(await hibpCheck('correct-horse-battery-staple-xyz')).toBe(false);
  });

  it('returns false on outage (5xx) and does not throw', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);
    expect(await hibpCheck('any-password')).toBe(false);
  });

  it('returns false on network timeout', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    expect(await hibpCheck('any-password')).toBe(false);
  });
});
