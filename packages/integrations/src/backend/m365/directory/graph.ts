import { type Client, ResponseType } from '@microsoft/microsoft-graph-client';
import type { GraphDirectoryUser, MailboxSettings } from './types.ts';

/**
 * Graph `/users/delta` `$select` field set (design §5.1), plus `manager` — selecting it on the
 * delta endpoint makes Graph report manager changes via the `manager@delta` wire form, which
 * `walkUsers` unwraps below. `/users/delta` supports neither `$expand` nor `$top`, so those are
 * never used here.
 */
const USER_SELECT = [
  'id',
  'userPrincipalName',
  'mail',
  'otherMails',
  'displayName',
  'employeeId',
  'employeeType',
  'employeeHireDate',
  'employeeLeaveDateTime',
  'jobTitle',
  'department',
  'employeeOrgData',
  'mobilePhone',
  'businessPhones',
  'accountEnabled',
  'userType',
  'manager',
].join(',');

/** The wire shape of a `/users/delta` page entry, before `manager@delta` is unwrapped. */
type GraphDeltaUserWire = Omit<GraphDirectoryUser, 'manager'> & {
  'manager@delta'?: Array<{ id?: string; '@removed'?: { reason: string } }>;
};

interface GraphDeltaPage {
  value: GraphDeltaUserWire[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

interface GraphPhotoMetadata {
  '@odata.mediaEtag': string;
  contentType?: string;
}

interface GraphOrganizationPage {
  value: Array<{ verifiedDomains?: Array<{ name?: string }> }>;
}

function statusCodeOf(err: unknown): number | undefined {
  return typeof err === 'object' && err !== null && 'statusCode' in err
    ? (err as { statusCode?: number }).statusCode
    : undefined;
}

/** Unwraps `manager@delta` (a single-valued nav property delta, so at most one element). */
function unwrapUser(raw: GraphDeltaUserWire): GraphDirectoryUser {
  const { 'manager@delta': managerDelta, ...rest } = raw;
  const user = rest as GraphDirectoryUser;
  if (managerDelta) {
    const entry = managerDelta[0];
    user.manager = entry?.id ? { id: entry.id } : null;
  }
  return user;
}

export interface DirectoryGraph {
  verifiedDomains(): Promise<Set<string>>;
  walkUsers(
    deltaLink: string | null,
  ): Promise<{ users: GraphDirectoryUser[]; removed: string[]; deltaLink: string }>;
  /** `null` when Graph refused/lacks the mailbox settings for this user (403/404) — see `types.ts`. */
  mailboxSettings(oid: string): Promise<MailboxSettings | null>;
  /** `null` when the user has no photo (404) or `knownEtag` still matches (unchanged, not re-fetched). */
  photo(
    oid: string,
    knownEtag: string | null,
  ): Promise<{ bytes: Uint8Array; contentType: string; etag: string } | null>;
}

export function createDirectoryGraph(client: Client): DirectoryGraph {
  return {
    async verifiedDomains() {
      const page = (await client.api('/organization').get()) as GraphOrganizationPage;
      const domains = new Set<string>();
      for (const org of page.value ?? []) {
        for (const domain of org.verifiedDomains ?? []) {
          if (domain.name) domains.add(domain.name);
        }
      }
      return domains;
    },

    async walkUsers(deltaLink) {
      let path = deltaLink ?? `/users/delta?$select=${USER_SELECT}`;
      const users: GraphDirectoryUser[] = [];
      const removed: string[] = [];

      while (true) {
        const page = (await client.api(path).get()) as GraphDeltaPage;
        for (const raw of page.value) {
          if (raw['@removed']) {
            removed.push(raw.id);
            continue;
          }
          users.push(unwrapUser(raw));
        }

        if (page['@odata.nextLink']) {
          path = page['@odata.nextLink'];
          continue;
        }

        if (!page['@odata.deltaLink']) {
          throw new Error('Graph /users/delta final page is missing @odata.deltaLink');
        }
        return { users, removed, deltaLink: page['@odata.deltaLink'] };
      }
    },

    async mailboxSettings(oid) {
      try {
        return (await client.api(`/users/${oid}/mailboxSettings`).get()) as MailboxSettings;
      } catch (err) {
        const status = statusCodeOf(err);
        // Application-permission tenants frequently deny MailboxSettings.Read for some or all
        // users; a 403 (or a 404 for a user Graph won't resolve the mailbox for) means "unknown
        // for this person", not a sync failure — the caller leaves mailbox-derived fields
        // untouched. Any other failure is a real transport problem and must propagate.
        if (status === 403 || status === 404) return null;
        throw err;
      }
    },

    async photo(oid, knownEtag) {
      let meta: GraphPhotoMetadata;
      try {
        meta = (await client.api(`/users/${oid}/photo`).get()) as GraphPhotoMetadata;
      } catch (err) {
        // A user with no photo returns 404 — that is normal, not an error.
        if (statusCodeOf(err) === 404) return null;
        throw err;
      }

      const etag = meta['@odata.mediaEtag'];
      if (knownEtag != null && knownEtag === etag) return null;

      const buffer = (await client
        .api(`/users/${oid}/photo/$value`)
        .responseType(ResponseType.ARRAYBUFFER)
        .get()) as ArrayBuffer;

      return {
        bytes: new Uint8Array(buffer),
        contentType: meta.contentType ?? 'application/octet-stream',
        etag,
      };
    },
  };
}
