import { getPool } from '@seta/shared-db';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

export * from './schema.ts';
export const plannerDb = () => drizzle(getPool('worker'), { schema });
export type PlannerDb = ReturnType<typeof plannerDb>;
