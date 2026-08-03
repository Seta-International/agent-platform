import type { GraphDirectoryUser } from './types.ts';

/**
 * Design §7.3: only `userType = 'Member'` users on a verified email domain are in scope.
 * Guests, rooms and service accounts are dropped here — counted and never persisted by the
 * caller. Pure and I/O-free: `verifiedDomains` is supplied by the caller (a prior
 * `GET /organization` call), never fetched here.
 */
export function isSyncableUser(
  u: GraphDirectoryUser,
  verifiedDomains: ReadonlySet<string>,
): boolean {
  if (u.userType !== 'Member') return false;

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
