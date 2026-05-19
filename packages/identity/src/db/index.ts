import { getPool } from '@seta/shared-db';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

export const identityDb = () => drizzle(getPool('worker'), { schema });
export type IdentityDb = ReturnType<typeof identityDb>;

export * as identitySchema from './schema.ts';
