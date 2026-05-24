import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../db/schema/index.ts';
import {
  bumpFailureStateDb,
  clearFailureStateDb,
  type FailureEntry,
  getFailureEntryDb,
  resetAllFailureStateDb,
} from './failure-state-store.ts';

export type { FailureEntry } from './failure-state-store.ts';

export function bumpFailureState(
  db: NodePgDatabase<typeof schema>,
  subscription: string,
  eventId: string,
  err: unknown,
  opts: { baseMs: number; maxMs: number },
): Promise<number> {
  return bumpFailureStateDb(db, subscription, eventId, err, opts);
}

export function clearFailureState(
  db: NodePgDatabase<typeof schema>,
  subscription: string,
  eventId: string,
): Promise<void> {
  return clearFailureStateDb(db, subscription, eventId);
}

export function getFailureEntry(
  db: NodePgDatabase<typeof schema>,
  subscription: string,
): Promise<FailureEntry | undefined> {
  return getFailureEntryDb(db, subscription);
}

export function resetAllFailureState(db: NodePgDatabase<typeof schema>): Promise<void> {
  return resetAllFailureStateDb(db);
}
