import { describe, expect, it } from 'vitest';
import { validateLoginSearch } from '../../../src/routes/login';

describe('login route validateSearch', () => {
  it('keeps the error param so SSO failures reach the screen', () => {
    expect(validateLoginSearch({ error: 'tid_mismatch' })).toMatchObject({
      error: 'tid_mismatch',
    });
  });

  it('drops non-string params', () => {
    expect(validateLoginSearch({ error: 42 })).toMatchObject({ error: undefined });
  });
});
