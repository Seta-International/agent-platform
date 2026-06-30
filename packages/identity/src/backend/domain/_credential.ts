import type { account } from '../db/schema.ts';

type CredentialAccountRow = typeof account.$inferInsert;

/**
 * The better-auth credential `account` row for a local password login. Shared by
 * createUser (fresh insert) and ensureLocalLogin (upsert) so the row shape — the
 * `credential` provider and the `account_id = user_id` convention — can't drift.
 * Hashing stays on the single `argon2id` path; callers pass the already-hashed value.
 */
export function credentialAccountValues(
  userId: string,
  passwordHash: string,
): CredentialAccountRow {
  return {
    id: crypto.randomUUID(),
    user_id: userId,
    provider_id: 'credential',
    account_id: userId,
    password: passwordHash,
  };
}
