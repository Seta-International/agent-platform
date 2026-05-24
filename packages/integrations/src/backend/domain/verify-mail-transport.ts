import { emit, withEmit } from '@seta/core/events';
import type { EncryptedBlob } from '@seta/shared-crypto';
import { type MailerEnv, type ResolvedTransport, resolveTransport } from '@seta/shared-mailer';
import { renderTemplate } from '@seta/shared-mailer/render';
import { eq, sql } from 'drizzle-orm';
import { integrationsDb } from '../../db/client.ts';
import { mailTransportConfig } from '../../db/schema/index.ts';
import { INTEGRATIONS_PERMISSIONS, IntegrationsError, requirePermission } from '../rbac.ts';
import type { Actor } from './get-mail-transport-config.ts';
import { createMailTransportConfigStore } from './mail-transport-config-store.ts';

export interface VerifyMailTransportArgs {
  tenantId: string;
  actor: Actor;
  recipient: string;
  env: MailerEnv;
  crypto: {
    encrypt(p: string): Promise<EncryptedBlob>;
    decrypt(b: EncryptedBlob): Promise<string>;
  };
  lookupEntraTenantId(tenantId: string): Promise<string | null>;
  transportOverride?: ResolvedTransport;
}

export interface VerifyMailTransportResult {
  ok: boolean;
  transport_message_id?: string | null;
  error?: { code: string; message: string };
}

export async function verifyMailTransport(
  args: VerifyMailTransportArgs,
): Promise<VerifyMailTransportResult> {
  requirePermission(args.actor, INTEGRATIONS_PERMISSIONS.mailConfigure);
  if (args.actor.tenantId !== args.tenantId)
    throw new IntegrationsError('FORBIDDEN', 'tenant mismatch');

  const store = createMailTransportConfigStore({ db: integrationsDb() });
  const resolved =
    args.transportOverride ??
    (await resolveTransport(args.tenantId, {
      env: args.env,
      configStore: { findEnabled: (tid: string) => store.findEnabled(tid) },
      lookupEntraTenantId: args.lookupEntraTenantId,
      crypto: args.crypto,
    }));

  const rendered = await renderTemplate('_test-send', {
    tenantName: args.tenantId,
    attemptedAt: new Date().toISOString(),
  });
  try {
    const out = await resolved.transport.send({
      from: resolved.sender,
      fromDisplayName: resolved.senderDisplayName,
      to: args.recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await withEmit(
      { actor: { userId: String(args.actor.user_id), tenantId: args.tenantId } },
      async (tx) => {
        await tx
          .update(mailTransportConfig)
          .set({ lastVerifiedAt: sql`now()`, lastVerifyError: null })
          .where(eq(mailTransportConfig.tenantId, args.tenantId));
        await emit({
          tenantId: args.tenantId,
          aggregateType: 'mail_transport_config',
          aggregateId: args.tenantId,
          eventType: 'integrations.mail_transport.verify_succeeded',
          eventVersion: 1,
          payload: { kind: resolved.transportKind, transport_message_id: out.messageId },
        });
      },
    );
    return { ok: true, transport_message_id: out.messageId };
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'UNKNOWN';
    const message = (err as Error).message ?? String(err);
    await withEmit(
      { actor: { userId: String(args.actor.user_id), tenantId: args.tenantId } },
      async (tx) => {
        await tx
          .update(mailTransportConfig)
          .set({ lastVerifyError: message })
          .where(eq(mailTransportConfig.tenantId, args.tenantId));
        await emit({
          tenantId: args.tenantId,
          aggregateType: 'mail_transport_config',
          aggregateId: args.tenantId,
          eventType: 'integrations.mail_transport.verify_failed',
          eventVersion: 1,
          payload: { kind: resolved.transportKind, error_code: code, error_message: message },
        });
      },
    );
    return { ok: false, error: { code, message } };
  }
}
