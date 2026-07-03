import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  // chunks.ts is deliberately omitted: knowledge.chunks is a LIST-partitioned table with a
  // composite FK that drizzle-kit cannot model, so it is owned by the hand-written
  // 0001_knowledge_platform.sql. tablesFilter does not apply to `generate` in drizzle-kit,
  // so the exclusion is enforced by pointing `schema` only at schema.ts (which no longer
  // re-exports chunks).
  schema: './src/backend/db/schema.ts',
  out: './drizzle/migrations',
  schemaFilter: ['knowledge'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/platform_dev',
  },
  verbose: true,
  strict: true,
});
