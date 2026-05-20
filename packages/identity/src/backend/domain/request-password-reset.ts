import { randomBytes } from 'node:crypto';
import type { Mailer } from '@seta/shared-mailer';
import { eq } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { user as userTable, verification } from '../../db/schema.ts';

export interface RequestPasswordResetArgs {
  tenantId: string;
  email: string;
  baseUrl: string;
  requestedFromIp: string;
  mailer: Mailer;
  ttlMs?: number;
}

/**
 * Anti-enumeration: silently no-op if email doesn't match a user.
 */
export async function requestPasswordReset(args: RequestPasswordResetArgs): Promise<void> {
  const email = args.email.toLowerCase().trim();
  const [u] = await identityDb()
    .select()
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);
  if (!u) return;

  const nonce = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + (args.ttlMs ?? 1000 * 60 * 60));
  await identityDb()
    .insert(verification)
    .values({
      id: crypto.randomUUID(),
      identifier: `password-reset:${u.id}:${nonce}`,
      value: email,
      expires_at: expiresAt,
    });

  const resetUrl = `${args.baseUrl.replace(/\/$/, '')}/reset?token=${encodeURIComponent(nonce)}`;
  await args.mailer.send({
    to: email,
    template: 'password-reset',
    props: {
      displayName: u.name ?? u.email,
      resetUrl,
      expiresAt: expiresAt.toISOString(),
      requestedFromIp: args.requestedFromIp,
    },
    tenantId: args.tenantId,
    dedupeKey: `password-reset:${u.id}:${nonce}`,
  });
}
