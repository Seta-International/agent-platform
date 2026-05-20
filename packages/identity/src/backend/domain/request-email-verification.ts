import { randomBytes } from 'node:crypto';
import type { Mailer } from '@seta/shared-mailer';
import { eq } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { user as userTable, verification } from '../../db/schema.ts';
import { IdentityError } from '../rbac.ts';

export interface RequestEmailVerificationArgs {
  tenantId: string;
  userId: string;
  baseUrl: string;
  mailer: Mailer;
  ttlMs?: number;
}

export async function requestEmailVerification(args: RequestEmailVerificationArgs): Promise<void> {
  const [u] = await identityDb()
    .select()
    .from(userTable)
    .where(eq(userTable.id, args.userId))
    .limit(1);
  if (!u) throw new IdentityError('USER_NOT_FOUND', `no user ${args.userId}`);

  const nonce = randomBytes(24).toString('base64url');
  const ttl = args.ttlMs ?? 1000 * 60 * 60;
  const expiresAt = new Date(Date.now() + ttl);
  await identityDb()
    .insert(verification)
    .values({
      id: crypto.randomUUID(),
      identifier: `verify-email:${args.userId}:${nonce}`,
      value: u.email,
      expires_at: expiresAt,
    });

  const verifyUrl = `${args.baseUrl.replace(/\/$/, '')}/verify?token=${encodeURIComponent(nonce)}`;
  await args.mailer.send({
    to: u.email,
    template: 'verify-email',
    props: {
      displayName: u.name ?? u.email,
      verifyUrl,
      expiresAt: expiresAt.toISOString(),
    },
    tenantId: args.tenantId,
    dedupeKey: `verify-email:${args.userId}:${nonce}`,
  });
}
