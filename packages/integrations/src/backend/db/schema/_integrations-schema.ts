import { pgSchema } from 'drizzle-orm/pg-core';

export const integrations = pgSchema('integrations');

export const SYNC_STATUS = ['idle', 'pulling', 'pushing', 'error', 'conflict'] as const;
