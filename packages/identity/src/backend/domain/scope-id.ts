import { NIL_SCOPE_ID } from '../db/schema.ts';

/** Domain null scope → physical nil-uuid sentinel (access_group_role.scope_id is NOT NULL). */
export const scopeIdToDb = (scopeId: string | null): string => scopeId ?? NIL_SCOPE_ID;

/** Physical nil-uuid sentinel → domain null scope. */
export const scopeIdFromDb = (scopeId: string): string | null =>
  scopeId === NIL_SCOPE_ID ? null : scopeId;
