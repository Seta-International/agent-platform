// rbac: public-endpoint — pre-auth password reset request. The reset link goes to the
// account's verified email; abuse is rate-limited at the HTTP layer.
import { randomBytes } from 'node:crypto';
import type { Mailer } from '@seta/shared-mailer';
import { eq } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { user as userTable, verification } from '../db/schema.ts';

export interface RequestPasswordResetArgs {
  tenantId: string;
  email: string;
  baseUrl: string;
  requestedFromIp: string;
  mailer: Mailer;
  ttlMs?: number;
}

export interface MintedResetToken {
  url: string;
  userId: string;
  email: string;
  displayName: string;
  nonce: string;
  expiresAt: Date;
}

export async function mintPasswordResetUrlIfKnown(
  email: string,
  baseUrl: string,
  ttlMs: number = 1000 * 60 * 60,
): Promise<MintedResetToken | null> {
  const normalized = email.toLowerCase().trim();
  const [u] = await identityDb()
    .select()
    .from(userTable)
    .where(eq(userTable.email, normalized))
    .limit(1);
  if (!u) return null;

  const nonce = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlMs);
  await identityDb()
    .insert(verification)
    .values({
      id: crypto.randomUUID(),
      identifier: `password-reset:${u.id}:${nonce}`,
      value: normalized,
      expires_at: expiresAt,
    });

  const url = `${baseUrl.replace(/\/$/, '')}/reset?token=${encodeURIComponent(nonce)}`;
  return {
    url,
    userId: u.id,
    email: normalized,
    displayName: u.name ?? normalized,
    nonce,
    expiresAt,
  };
}

/**
 * Anti-enumeration: silently no-op if email doesn't match a user.
 */
export async function requestPasswordReset(args: RequestPasswordResetArgs): Promise<void> {
  const minted = await mintPasswordResetUrlIfKnown(args.email, args.baseUrl, args.ttlMs);
  if (!minted) return;

  await args.mailer.send({
    to: minted.email,
    template: 'password-reset',
    props: {
      displayName: minted.displayName,
      resetUrl: minted.url,
      expiresAt: minted.expiresAt.toISOString(),
      requestedFromIp: args.requestedFromIp,
    },
    tenantId: args.tenantId,
    dedupeKey: `password-reset:${minted.userId}:${minted.nonce}`,
  });
}
