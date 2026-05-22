import { describe, expect, it } from 'vitest';
import * as sdk from '../src/index.ts';

describe('@seta/module-sdk', () => {
  it('loads the NavManifest type surface', () => {
    expect(typeof sdk).toBe('object');
  });
});
