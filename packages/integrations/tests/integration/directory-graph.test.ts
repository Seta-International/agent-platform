import type { Client } from '@microsoft/microsoft-graph-client';
import { describe, expect, it } from 'vitest';
import deltaIncrementalPage from '../../src/backend/m365/directory/__fixtures__/delta-incremental-page.json' with {
  type: 'json',
};
import deltaInitialPage1 from '../../src/backend/m365/directory/__fixtures__/delta-initial-page-1.json' with {
  type: 'json',
};
import deltaInitialPage2 from '../../src/backend/m365/directory/__fixtures__/delta-initial-page-2.json' with {
  type: 'json',
};
import { createDirectoryGraph } from '../../src/backend/m365/directory/graph.ts';

const PAGE_2_URL = 'https://graph.microsoft.com/v1.0/users/delta?$skiptoken=PAGE2TOKEN';
const DELTA_LINK_1 = 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=DELTATOKEN1';
const DELTA_LINK_2 = 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=DELTATOKEN2';
const INITIAL_DELTA_PATH =
  '/users/delta?$select=id,userPrincipalName,mail,otherMails,displayName,employeeId,employeeType,employeeHireDate,employeeLeaveDateTime,jobTitle,department,employeeOrgData,mobilePhone,businessPhones,accountEnabled,userType,manager';

type RouteHandler = () => unknown;

function graphError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode, body: { error: { code: message } } });
}

function makeStubClient(routes: Record<string, RouteHandler>) {
  const calls: string[] = [];
  const responseTypes: Record<string, string> = {};

  function makeBuilder(path: string) {
    return {
      responseType(rt: string) {
        responseTypes[path] = rt;
        return makeBuilder(path);
      },
      async get() {
        const handler = routes[path];
        if (!handler) throw new Error(`unmocked GET ${path}`);
        return handler();
      },
    };
  }

  const client = {
    api(path: string) {
      calls.push(path);
      return makeBuilder(path);
    },
  };

  return { client: client as unknown as Client, calls, responseTypes };
}

describe('createDirectoryGraph', () => {
  describe('walkUsers — multi-page initial pull', () => {
    it('follows @odata.nextLink to exhaustion and returns the final deltaLink', async () => {
      const { client, calls } = makeStubClient({
        [INITIAL_DELTA_PATH]: () => deltaInitialPage1,
        [PAGE_2_URL]: () => deltaInitialPage2,
      });

      const graph = createDirectoryGraph(client);
      const result = await graph.walkUsers(null);

      expect(calls).toEqual([INITIAL_DELTA_PATH, PAGE_2_URL]);
      expect(result.deltaLink).toBe(DELTA_LINK_1);
      expect(result.users).toHaveLength(2);
      expect(result.users.map((u) => u.id)).toEqual(['OID-1', 'OID-2']);
      expect(result.removed).toEqual([]);
    });
  });

  describe('walkUsers — incremental pull from a persisted deltaLink', () => {
    it('unwraps manager@delta and surfaces @removed entries separately from users', async () => {
      const { client, calls } = makeStubClient({
        [DELTA_LINK_1]: () => deltaIncrementalPage,
      });

      const graph = createDirectoryGraph(client);
      const result = await graph.walkUsers(DELTA_LINK_1);

      expect(calls).toEqual([DELTA_LINK_1]);
      expect(result.deltaLink).toBe(DELTA_LINK_2);
      expect(result.removed).toEqual(['OID-3']);
      expect(result.users).toHaveLength(1);
      expect(result.users[0]).toMatchObject({ id: 'OID-1', manager: { id: 'OID-2' } });
      // The wrapped wire form must not leak through.
      expect(result.users[0]).not.toHaveProperty('manager@delta');
    });
  });

  describe('mailboxSettings', () => {
    it('returns null on a 403 (MailboxSettings.Read not consented) rather than throwing', async () => {
      const { client } = makeStubClient({
        '/users/OID-1/mailboxSettings': () => {
          throw graphError(403, 'Forbidden');
        },
      });

      const graph = createDirectoryGraph(client);
      await expect(graph.mailboxSettings('OID-1')).resolves.toBeNull();
    });

    it('returns null on a 404', async () => {
      const { client } = makeStubClient({
        '/users/OID-1/mailboxSettings': () => {
          throw graphError(404, 'Not Found');
        },
      });

      const graph = createDirectoryGraph(client);
      await expect(graph.mailboxSettings('OID-1')).resolves.toBeNull();
    });

    it('propagates a real transport failure (500) rather than swallowing it', async () => {
      const { client } = makeStubClient({
        '/users/OID-1/mailboxSettings': () => {
          throw graphError(500, 'Internal Server Error');
        },
      });

      const graph = createDirectoryGraph(client);
      await expect(graph.mailboxSettings('OID-1')).rejects.toThrow('Internal Server Error');
    });

    it('returns the settings object on success', async () => {
      const settings = {
        timeZone: 'SE Asia Standard Time',
        workingHours: { startTime: '09:00:00.0000000', endTime: '18:00:00.0000000' },
        automaticRepliesSetting: { status: 'disabled', scheduledEndDateTime: null },
      };
      const { client } = makeStubClient({
        '/users/OID-1/mailboxSettings': () => settings,
      });

      const graph = createDirectoryGraph(client);
      await expect(graph.mailboxSettings('OID-1')).resolves.toEqual(settings);
    });
  });

  describe('photo', () => {
    it('returns { kind: "none" } on 404 (no photo) without error', async () => {
      const { client } = makeStubClient({
        '/users/OID-1/photo': () => {
          throw graphError(404, 'Not Found');
        },
      });

      const graph = createDirectoryGraph(client);
      await expect(graph.photo('OID-1', null)).resolves.toEqual({ kind: 'none' });
    });

    it('returns { kind: "unchanged" } without fetching bytes when the known etag matches', async () => {
      const { client, calls } = makeStubClient({
        '/users/OID-1/photo': () => ({
          '@odata.mediaEtag': 'W/"etag-abc"',
          contentType: 'image/jpeg',
        }),
        '/users/OID-1/photo/$value': () => {
          throw new Error('should not be called when etag is unchanged');
        },
      });

      const graph = createDirectoryGraph(client);
      const result = await graph.photo('OID-1', 'W/"etag-abc"');

      expect(result).toEqual({ kind: 'unchanged' });
      expect(calls).toEqual(['/users/OID-1/photo']);
    });

    it('fetches bytes when the known etag differs (or is absent), returning { kind: "fetched" }', async () => {
      const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
      const { client } = makeStubClient({
        '/users/OID-1/photo': () => ({
          '@odata.mediaEtag': 'W/"etag-new"',
          contentType: 'image/png',
        }),
        '/users/OID-1/photo/$value': () => bytes,
      });

      const graph = createDirectoryGraph(client);
      const result = await graph.photo('OID-1', 'W/"etag-old"');

      expect(result.kind).toBe('fetched');
      if (result.kind !== 'fetched') throw new Error('unreachable');
      expect(result.etag).toBe('W/"etag-new"');
      expect(result.contentType).toBe('image/png');
      expect(Array.from(result.bytes)).toEqual([1, 2, 3, 4]);
    });

    it('propagates a real transport failure (500) rather than swallowing it', async () => {
      const { client } = makeStubClient({
        '/users/OID-1/photo': () => {
          throw graphError(500, 'Internal Server Error');
        },
      });

      const graph = createDirectoryGraph(client);
      await expect(graph.photo('OID-1', null)).rejects.toThrow('Internal Server Error');
    });
  });

  describe('verifiedDomains', () => {
    it('flattens verifiedDomains from GET /organization into a Set of names', async () => {
      const { client } = makeStubClient({
        '/organization': () => ({
          value: [
            {
              id: 'org-1',
              verifiedDomains: [{ name: 'contoso.com' }, { name: 'contoso.onmicrosoft.com' }],
            },
          ],
        }),
      });

      const graph = createDirectoryGraph(client);
      const domains = await graph.verifiedDomains();

      expect(domains).toEqual(new Set(['contoso.com', 'contoso.onmicrosoft.com']));
    });
  });
});
