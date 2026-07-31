import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // events.ts is deliberately omitted: core.events is a RANGE-partitioned table that
  // drizzle-kit cannot model, so it is owned by the hand-written 0001_core_platform.sql.
  // index.ts is omitted because it re-exports events.ts. tablesFilter does not apply to
  // `generate` in drizzle-kit 0.31, so exclusion is enforced via this explicit file list.
  schema: [
    './src/db/schema/_core-schema.ts',
    './src/db/schema/agent-eval.ts',
    './src/db/schema/mutation-idempotency.ts',
    './src/db/schema/outgoing-emails.ts',
    './src/db/schema/rpc-idempotency.ts',
    './src/db/schema/session-scope.ts',
    './src/db/schema/skills.ts',
    './src/db/schema/subscription-failure-state.ts',
    './src/db/schema/subscriptions.ts',
    './src/db/schema/tenants.ts',
  ],
  out: './drizzle/migrations',
  dialect: 'postgresql',
  schemaFilter: ['core'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://seta:seta@localhost:5542/seta',
  },
});
