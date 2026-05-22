import { describe, expect, it } from 'vitest';
import type { GraphLikeRead } from '../../../src/m365/jobs/_graph-types.ts';
import { createPlansGraph } from '../../../src/m365/plans/graph.ts';

function makeStub(routes: Record<string, () => unknown>) {
  const calls: string[] = [];
  return {
    calls,
    api(path: string) {
      calls.push(path);
      const handler = routes[path];
      if (!handler) throw new Error(`unmocked GET ${path}`);
      return {
        get: async () => handler(),
        select: () => ({ get: async () => handler() }),
        filter: () => ({ get: async () => handler() }),
      } as any;
    },
  };
}

describe('createPlansGraph', () => {
  describe('listBuckets — 2-page pagination', () => {
    it('concatenates pages via @odata.nextLink and terminates', async () => {
      const nextUrl = 'https://graph.microsoft.com/v1.0/planner/plans/P/buckets?$skip=1';
      const stub = makeStub({
        '/planner/plans/P/buckets': () => ({
          value: [{ id: 'B1', '@odata.etag': 'W/"1"', name: 'A', planId: 'P', orderHint: '8' }],
          '@odata.nextLink': nextUrl,
        }),
        [nextUrl]: () => ({
          value: [{ id: 'B2', '@odata.etag': 'W/"1"', name: 'B', planId: 'P', orderHint: '9' }],
        }),
      });

      const graph = createPlansGraph(stub as unknown as GraphLikeRead);
      const buckets = await graph.listBuckets('P');

      expect(buckets).toHaveLength(2);
      expect(buckets.map((b) => b.id)).toEqual(['B1', 'B2']);
      expect(stub.calls).toEqual(['/planner/plans/P/buckets', nextUrl]);
    });
  });

  describe('getPlanDetails — single-object read', () => {
    it('fetches /planner/plans/{id}/details and returns body verbatim', async () => {
      const details = {
        id: 'P',
        '@odata.etag': 'W/"abc"',
        sharedWith: { 'user-oid': true },
        categoryDescriptions: { category1: 'Urgent', category2: null },
      };
      const stub = makeStub({
        '/planner/plans/P/details': () => details,
      });

      const graph = createPlansGraph(stub as unknown as GraphLikeRead);
      const result = await graph.getPlanDetails('P');

      expect(result).toEqual(details);
      expect(stub.calls).toEqual(['/planner/plans/P/details']);
    });
  });
});
