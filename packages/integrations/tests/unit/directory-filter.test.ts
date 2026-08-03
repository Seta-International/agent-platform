import { describe, expect, it } from 'vitest';
import { isSyncableUser } from '../../src/backend/m365/directory/filter.ts';
import type { GraphDirectoryUser } from '../../src/backend/m365/directory/types.ts';

const verified = new Set(['seta-international.vn']);

function user(overrides: Partial<GraphDirectoryUser>): GraphDirectoryUser {
  return { id: 'oid', userType: 'Member', mail: 'person@seta-international.vn', ...overrides };
}

describe('isSyncableUser (design §7.3)', () => {
  it('a Member on a verified domain is syncable', () => {
    expect(isSyncableUser(user({}), verified)).toBe(true);
  });

  it('userType "Guest" is excluded', () => {
    expect(isSyncableUser(user({ userType: 'Guest' }), verified)).toBe(false);
  });

  it('verified-domain matching is case-insensitive against the email domain', () => {
    expect(isSyncableUser(user({ mail: 'person@SETA-International.VN' }), verified)).toBe(true);
  });

  it('verified-domain matching is case-insensitive against the verified-domains set', () => {
    const mixedCaseVerified = new Set(['Seta-International.VN']);
    expect(isSyncableUser(user({ mail: 'person@seta-international.vn' }), mixedCaseVerified)).toBe(
      true,
    );
  });

  it('an unverified domain is excluded', () => {
    expect(isSyncableUser(user({ mail: 'person@othercorp.com' }), verified)).toBe(false);
  });

  it('mail and userPrincipalName both null/absent are excluded', () => {
    expect(isSyncableUser(user({ mail: null, userPrincipalName: undefined }), verified)).toBe(
      false,
    );
  });

  it('falls back to userPrincipalName when mail is absent', () => {
    expect(
      isSyncableUser(
        user({ mail: undefined, userPrincipalName: 'person@seta-international.vn' }),
        verified,
      ),
    ).toBe(true);
  });

  it('a room/service account (no userType "Member") is excluded even on a verified domain', () => {
    expect(isSyncableUser(user({ userType: 'Room' }), verified)).toBe(false);
  });
});
