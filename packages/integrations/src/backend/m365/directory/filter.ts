import type { GraphDirectoryUser } from './types.ts';

/**
 * Design §7.3: only `userType = 'Member'` users on a verified email domain are in scope.
 * Guests, rooms and service accounts are dropped here — counted and never persisted by the
 * caller. Pure and I/O-free: `verifiedDomains` is supplied by the caller (a prior
 * `GET /organization` call), never fetched here.
 */
/**
 * Entra models room, equipment and shared mailboxes as ordinary `userType: 'Member'` users on a
 * verified domain, so the `userType` check alone lets every one of them through and the sync turns
 * meeting rooms into people. The authoritative discriminator is `mailboxSettings.userPurpose`, but
 * that needs `MailboxSettings.Read` consent the directory app is not guaranteed to hold (it answers
 * 403 without it) and `/places` needs `Place.Read.All`, so neither can be relied on here.
 *
 * What `/users/delta` always carries is the licence assignment and the name parts. A resource or
 * service mailbox holds no licence *and* has neither `givenName` nor `surname`; a real person is
 * either licensed or has a name recorded. Requiring **both** conditions before excluding keeps the
 * two populations that would otherwise be lost: a licensed account with no name parts (service-desk
 * logins are routinely like this) and an unlicensed human (a leaver, or a licence freed for reuse).
 */
function isResourceOrServiceMailbox(u: GraphDirectoryUser): boolean {
  const licensed = (u.assignedLicenses?.length ?? 0) > 0;
  if (licensed) return false;
  // Empty string counts as absent: Entra stores a cleared name part as '' about as often as null.
  return !u.givenName && !u.surname;
}

export function isSyncableUser(
  u: GraphDirectoryUser,
  verifiedDomains: ReadonlySet<string>,
): boolean {
  if (u.userType !== 'Member') return false;
  if (isResourceOrServiceMailbox(u)) return false;

  const email = u.mail ?? u.userPrincipalName;
  if (email == null) return false;

  const at = email.lastIndexOf('@');
  if (at === -1) return false;
  const domain = email.slice(at + 1).toLowerCase();

  // Case-insensitive on both sides: neither Entra's verified-domain casing nor the mail
  // domain's casing is guaranteed to match the other.
  for (const verified of verifiedDomains) {
    if (verified.toLowerCase() === domain) return true;
  }
  return false;
}
