import { emit, withEmit } from '@seta/core/events';
import type { EncryptedBlob } from '@seta/shared-crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { mailTransportConfig } from '../../db/schema/index.ts';
import { INTEGRATIONS_PERMISSIONS, IntegrationsError } from '../rbac.ts';
import type { Actor } from './get-mail-transport-config.ts';

const graphInputSchema = z.object({
  kind: z.literal('graph'),
  senderAddress: z.email(),
  senderDisplayName: z.string().nullable(),
  config: z.object({ app_access_policy_documented: z.boolean() }),
});

const smtpInputSchema = z.object({
  kind: z.literal('smtp'),
  senderAddress: z.email(),
  senderDisplayName: z.string().nullable(),
  config: z.object({
    host: z.string().min(1),
    port: z
      .number()
      .int()
      .refine((p) => p === 465 || p === 587, 'port must be 465 or 587'),
    username: z.string().min(1),
    password: z.string().min(1),
    require_tls: z.boolean(),
  }),
});

const inputSchema = z.discriminatedUnion('kind', [graphInputSchema, smtpInputSchema]);

export type SetMailTransportConfigInput = z.infer<typeof inputSchema>;

export interface SetMailTransportConfigArgs {
  tenantId: string;
  actor: Actor;
  input: SetMailTransportConfigInput;
  crypto: { encrypt(plaintext: string): Promise<EncryptedBlob> };
}

export async function setMailTransportConfig(args: SetMailTransportConfigArgs): Promise<void> {
  if (!args.actor.permissions.has(INTEGRATIONS_PERMISSIONS.mailConfigure)) {
    throw new IntegrationsError(
      'FORBIDDEN',
      `missing permission ${INTEGRATIONS_PERMISSIONS.mailConfigure}`,
    );
  }
  if (args.actor.tenantId !== args.tenantId)
    throw new IntegrationsError('FORBIDDEN', 'tenant mismatch');

  const parsed = inputSchema.safeParse(args.input);
  if (!parsed.success) throw new IntegrationsError('INVALID_INPUT', parsed.error.message);

  let configPayload: unknown;
  if (parsed.data.kind === 'graph') {
    configPayload = parsed.data.config;
  } else {
    const blob = await args.crypto.encrypt(parsed.data.config.password);
    configPayload = {
      host: parsed.data.config.host,
      port: parsed.data.config.port,
      username: parsed.data.config.username,
      password_blob: blob,
      require_tls: parsed.data.config.require_tls,
    };
  }

  await withEmit(
    { actor: { userId: String(args.actor.user_id), tenantId: args.tenantId } },
    async (tx) => {
      await tx
        .insert(mailTransportConfig)
        .values({
          tenantId: args.tenantId,
          kind: parsed.data.kind,
          senderAddress: parsed.data.senderAddress,
          senderDisplayName: parsed.data.senderDisplayName,
          config: configPayload as never,
          enabled: true,
          createdBy: args.actor.user_id,
          updatedBy: args.actor.user_id,
        })
        .onConflictDoUpdate({
          target: mailTransportConfig.tenantId,
          set: {
            kind: parsed.data.kind,
            senderAddress: parsed.data.senderAddress,
            senderDisplayName: parsed.data.senderDisplayName,
            config: configPayload as never,
            enabled: true,
            updatedAt: sql`now()`,
            updatedBy: args.actor.user_id,
            lastVerifiedAt: null,
            lastVerifyError: null,
          },
        });
      await emit({
        tenantId: args.tenantId,
        aggregateType: 'mail_transport_config',
        aggregateId: args.tenantId,
        eventType: 'integrations.mail_transport.configured',
        eventVersion: 1,
        payload: { kind: parsed.data.kind, sender_address: parsed.data.senderAddress },
      });
    },
  );
}
