import { describe, expect, it } from 'vitest';
import { isSyncableUser } from '../../src/backend/m365/directory/filter.ts';
import type { GraphDirectoryUser } from '../../src/backend/m365/directory/types.ts';

const verified = new Set(['seta-international.vn']);

function user(overrides: Partial<GraphDirectoryUser>): GraphDirectoryUser {
  return {
    id: 'oid',
    userType: 'Member',
    mail: 'person@seta-international.vn',
    // A real person carries a name; the resource-mailbox suite below overrides these to null.
    givenName: 'Person',
    surname: 'Example',
    ...overrides,
  };
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

/**
 * Entra reports room, equipment and shared mailboxes as ordinary `userType: 'Member'` users on a
 * verified domain, so the checks above admit every one of them — a real tenant turned 6 meeting
 * rooms and 2 shared mailboxes into people. The authoritative discriminator,
 * `mailboxSettings.userPurpose`, needs `MailboxSettings.Read` consent that the directory app is
 * not guaranteed to hold (it answers 403 today), and `/places` needs `Place.Read.All`. What is
 * always present on `/users/delta` is the licence assignment and the name parts: a resource or
 * service mailbox holds no licence and has neither `givenName` nor `surname`, whereas real staff
 * are either licensed or carry a name. Both conditions must hold to exclude, so a licensed but
 * name-less account (common for service-desk logins) and an unlicensed leaver still sync.
 */
describe('isSyncableUser resource-mailbox exclusion (FUT-842)', () => {
  const room = { assignedLicenses: [], givenName: null, surname: null };

  it('excludes an unlicensed, name-less account (room/equipment/shared mailbox)', () => {
    expect(isSyncableUser(user({ displayName: 'Sydney Meeting Room', ...room }), verified)).toBe(
      false,
    );
  });

  it('excludes it when Graph omits assignedLicenses entirely rather than sending []', () => {
    expect(
      isSyncableUser(
        user({ givenName: null, surname: null, assignedLicenses: undefined }),
        verified,
      ),
    ).toBe(false);
  });

  it('keeps an unlicensed user who has a name (an unlicensed real person)', () => {
    expect(
      isSyncableUser(user({ assignedLicenses: [], givenName: 'Huy', surname: 'Phan' }), verified),
    ).toBe(true);
  });

  it('keeps a licensed user with no name parts (service-desk style account)', () => {
    expect(
      isSyncableUser(
        user({ assignedLicenses: [{ skuId: 'sku-1' }], givenName: null, surname: null }),
        verified,
      ),
    ).toBe(true);
  });

  it('keeps a user carrying only a surname', () => {
    expect(isSyncableUser(user({ ...room, surname: 'Phan' }), verified)).toBe(true);
  });

  it('treats empty-string name parts as absent', () => {
    expect(isSyncableUser(user({ ...room, givenName: '', surname: '' }), verified)).toBe(false);
  });
});
