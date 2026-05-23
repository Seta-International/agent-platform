import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/backend/db/schema.ts',
  out: './drizzle/migrations',
  schemaFilter: ['knowledge'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/seta_dev',
  },
  verbose: true,
  strict: true,
});
