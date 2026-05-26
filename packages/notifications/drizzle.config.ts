import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/backend/db/schema/index.ts',
  out: './drizzle/migrations',
  schemaFilter: ['notifications'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/platform_dev',
  },
  verbose: true,
  strict: true,
});
