import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  schemaFilter: ['core'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://seta:seta@localhost:5542/seta',
  },
});
