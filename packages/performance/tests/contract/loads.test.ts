import { describe, expect, it } from 'vitest';
import * as mod from '../../src/index.ts';

describe('@seta/performance public surface', () => {
  it('imports without throwing', () => {
    expect(typeof mod).toBe('object');
  });
});
