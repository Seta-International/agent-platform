import { RequestContext } from '@mastra/core/request-context';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it, vi } from 'vitest';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const ACTOR = '33333333-3333-3333-3333-333333333333';

// The vector hit must name the real seeded file: searchTenantKnowledge drops any chunk
// whose file_id is not in the ready-files set, so a placeholder id would make this test
// pass for the wrong reason.
const seeded = vi.hoisted(() => ({ fileId: '' }));

// The tool derives its tenant from the actor's session, and reaches identity + the
// embedding/vector/rerank stack to do it. None of that is under test here — the pool the
// tool picks is. Stub the rest so the only live dependency is the database connection.
vi.mock('@seta/identity', () => ({
  buildActorSession: async () => ({ tenant_id: TENANT_B, user_id: ACTOR }),
}));
vi.mock('@seta/shared-embeddings', () => ({
  resolveEmbeddingProvider: () => ({ modelId: 'stub', embed: async () => [[0.1, 0.2]] }),
}));
vi.mock('@seta/shared-retrieval', () => ({
  EmbedQueryCache: class {
    async get(_m: string, _q: string, fn: () => Promise<number[]>) {
      return fn();
    }
  },
  resolveReranker: () => ({
    rescore: async (_q: string, hits: { item: unknown; score: number }[]) =>
      hits.map((h) => ({ ...h, rerankScore: h.score, reranker: 'noop' as const })),
  }),
}));
vi.mock('../../src/backend/embeddings/vector-store.ts', () => ({
  KNOWLEDGE_VECTOR_INDEX: 'chunks',
  ensureKnowledgeVectorIndex: async () => {},
  getKnowledgeVectorStore: () => ({
    createIndex: async () => {},
    // The vector index is Mastra-owned and filtered by metadata, so it happily returns
    // tenant B's chunk. Only the knowledge.files read can stop it reaching the caller.
    query: async () => [
      {
        score: 0.9,
        metadata: {
          file_id: seeded.fileId,
          chunk_ordinal: 0,
          filename: 'b.pdf',
          page_hint: null,
          chunk_text: 'tenant B secret',
        },
      },
    ],
  }),
}));

const { searchTenantKnowledgeAgentTool } = await import('../../src/backend/agent-tools/index.ts');

const env = {
  template: () => process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  base: () => process.env.PLATFORM_TEST_PG_BASE as string,
};

function appRoleUrl(databaseUrl: string): string {
  return databaseUrl.replace(/\/\/[^@]+@/, '//seta_app:seta_app@');
}

function ctxFor(userId: string, tenantId: string) {
  const rc = new RequestContext();
  rc.set('actor', { type: 'user', user_id: userId });
  rc.set('tenant_id', tenantId);
  return { requestContext: rc } as never;
}

describe('knowledge_searchDocuments runs on an RLS-enforced connection', () => {
  it('cannot read another tenant even when the session it trusts names that tenant', async () => {
    await withTestDb(
      { templateDbName: env.template(), baseUrl: env.base() },
      async ({ pool, databaseUrl }) => {
        const inserted = await pool.query<{ id: string }>(
          `INSERT INTO knowledge.files
             (tenant_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status)
           VALUES ($1, gen_random_uuid(), 'b.pdf', 'application/pdf', 1, 'k/b.pdf', 'ready')
           RETURNING id`,
          [TENANT_B],
        );
        seeded.fileId = String(inserted.rows[0]?.id);
        await pool.query(`
          DO $do$
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seta_app') THEN
              CREATE ROLE seta_app LOGIN PASSWORD 'seta_app' NOSUPERUSER NOBYPASSRLS;
            END IF;
          END
          $do$;
        `);
        await pool.query(`ALTER ROLE seta_app LOGIN PASSWORD 'seta_app' NOSUPERUSER NOBYPASSRLS`);
        await pool.query(`GRANT USAGE ON SCHEMA knowledge TO seta_app`);
        await pool.query(`GRANT SELECT ON knowledge.files TO seta_app`);

        process.env.DATABASE_URL = databaseUrl;
        initPools({ databaseUrl, appDatabaseUrl: appRoleUrl(databaseUrl) });
        const execute = searchTenantKnowledgeAgentTool.execute;
        expect(execute).toBeDefined();
        try {
          // The request is scoped to tenant A; the (stubbed) session claims tenant B.
          // On an admin connection the tool's own WHERE clause is the only thing between
          // the caller and tenant B's documents, and it happily hands them over. The
          // database has to be what refuses.
          const out = (await scoped(TENANT_A, () =>
            execute?.({ query: 'secret', limit: 5 }, ctxFor(ACTOR, TENANT_B)),
          )) as { hits: unknown[] };
          expect(out.hits).toEqual([]);
        } finally {
          await closePools();
        }
      },
    );
  });
});
