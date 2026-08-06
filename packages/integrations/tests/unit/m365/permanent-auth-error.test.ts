import { describe, expect, it } from 'vitest';
import { isPermanentAuthError } from '../../../src/backend/m365/auth.ts';

/**
 * A wrong or expired client secret is a configuration fault, not a transient one: retrying it
 * cannot succeed. `m365.directory.pull` runs with `max_attempts: 25`, so before this guard a
 * mis-pasted secret burned all 25 attempts with backoff, rewriting `directory_last_error` each
 * time and drowning the worker log. These are the real AADSTS bodies `@azure/identity` surfaces.
 */
describe('isPermanentAuthError (FUT-842)', () => {
  const invalidSecret =
    "invalid_client: Error(s): 7000215 - Description: AADSTS7000215: Invalid client secret provided. Ensure the secret being sent in the request is the client secret value, not the client secret ID, for a secret added to app '82f1f47b-3550-4f17-9ade-cfba5789cb07'.";

  it('treats an invalid client secret (AADSTS7000215) as permanent', () => {
    expect(isPermanentAuthError(new Error(invalidSecret))).toBe(true);
  });

  it('treats an expired client secret (AADSTS7000222) as permanent', () => {
    expect(
      isPermanentAuthError(
        new Error('AADSTS7000222: The provided client secret keys for app are expired.'),
      ),
    ).toBe(true);
  });

  it('treats an unknown application (AADSTS700016) as permanent', () => {
    expect(
      isPermanentAuthError(new Error('AADSTS700016: Application with identifier was not found.')),
    ).toBe(true);
  });

  it('treats an unknown tenant (AADSTS90002) as permanent', () => {
    expect(isPermanentAuthError(new Error('AADSTS90002: Tenant not found.'))).toBe(true);
  });

  it('does NOT treat throttling as permanent — that must keep retrying', () => {
    expect(isPermanentAuthError(new Error('AADSTS429: Too many requests'))).toBe(false);
  });

  it('does NOT treat a transport failure as permanent', () => {
    expect(isPermanentAuthError(new Error('socket hang up'))).toBe(false);
  });

  it('does NOT treat an expired token as permanent — a refresh can fix it', () => {
    expect(isPermanentAuthError(new Error('AADSTS50173: The provided grant has expired.'))).toBe(
      false,
    );
  });

  it('reads the message off a nested cause', () => {
    const wrapped = new Error('directory pull failed', { cause: new Error(invalidSecret) });
    expect(isPermanentAuthError(wrapped)).toBe(true);
  });

  it('is safe on non-Error values', () => {
    expect(isPermanentAuthError(null)).toBe(false);
    expect(isPermanentAuthError('AADSTS7000215: invalid')).toBe(true);
  });
});
