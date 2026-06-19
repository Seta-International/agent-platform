import { describe, expect, it } from 'vitest';
import * as mod from '../../src/index.ts';

describe('@seta/hiring public surface', () => {
  it('imports without throwing', () => {
    expect(typeof mod).toBe('object');
  });
});
