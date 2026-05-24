import { describe, expect, it } from 'vitest';

describe('ci gate canary', () => {
  it('passes — flip to .fail to verify CI catches it', () => {
    expect(1 + 1).toBe(2);
  });
});
