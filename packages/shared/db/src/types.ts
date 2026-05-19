import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

export type { NodePgDatabase, Pool };
export type PoolName = 'web' | 'worker' | 'mastraState';
