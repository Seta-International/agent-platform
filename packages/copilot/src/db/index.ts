import { getPool } from '@seta/shared-db';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

export const copilotDb = () => drizzle(getPool('worker'), { schema });
export type CopilotDb = ReturnType<typeof copilotDb>;

export * as copilotSchema from './schema.ts';
