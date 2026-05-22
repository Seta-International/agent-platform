import type { EncryptedBlob } from '@seta/shared-crypto';
import type { MailerEnv } from './env.ts';
import { createDevStubTransport } from './transports/dev-stub.ts';
import { createGraphTransport } from './transports/graph.ts';
import { createSmtpTransport, createSmtpTransportFromUrl } from './transports/smtp.ts';
import type { Transport } from './transports/types.ts';
import { MailerError } from './types.ts';

export interface ResolveTransportConfigRow {
  tenantId: string;
  kind: 'graph' | 'smtp';
  senderAddress: string;
  senderDisplayName: string | null;
  config:
    | { app_access_policy_documented: boolean }
    | {
        host: string;
        port: number;
        username: string;
        password_blob: EncryptedBlob;
        require_tls: boolean;
      };
  enabled: boolean;
  lastVerifiedAt: Date | null;
  lastVerifyError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResolveTransportDeps {
  env: MailerEnv;
  configStore: { findEnabled(tenantId: string): Promise<ResolveTransportConfigRow | null> };
  lookupEntraTenantId(tenantId: string): Promise<string | null>;
  crypto: { decrypt(blob: EncryptedBlob): Promise<string> };
}

export interface ResolvedTransport {
  transport: Transport;
  sender: string;
  senderDisplayName?: string;
  transportKind: 'graph' | 'smtp' | 'dev-stub' | 'operator-smtp' | 'operator-dev-stub';
}

export async function resolveTransport(
  tenantId: string,
  deps: ResolveTransportDeps,
): Promise<ResolvedTransport> {
  const row = await deps.configStore.findEnabled(tenantId);
  if (row) {
    if (row.kind === 'graph') {
      const entraTid = await deps.lookupEntraTenantId(tenantId);
      if (!entraTid) {
        throw new MailerError(
          'TRANSPORT_UNCONFIGURED',
          'graph mail transport requires Entra SSO configured first',
        );
      }
      if (!deps.env.MAILER_GRAPH_CLIENT_ID || !deps.env.MAILER_GRAPH_CLIENT_SECRET) {
        throw new MailerError(
          'TRANSPORT_UNCONFIGURED',
          'MAILER_GRAPH_CLIENT_ID/SECRET not set on operator env',
        );
      }
      return {
        transport: createGraphTransport({
          entraTenantId: entraTid,
          sender: row.senderAddress,
          senderDisplayName: row.senderDisplayName ?? undefined,
          clientId: deps.env.MAILER_GRAPH_CLIENT_ID,
          clientSecret: deps.env.MAILER_GRAPH_CLIENT_SECRET,
        }),
        sender: row.senderAddress,
        senderDisplayName: row.senderDisplayName ?? undefined,
        transportKind: 'graph',
      };
    }
    const smtp = row.config as Extract<ResolveTransportConfigRow['config'], { host: string }>;
    const password = await deps.crypto.decrypt(smtp.password_blob);
    return {
      transport: createSmtpTransport({
        host: smtp.host,
        port: smtp.port,
        username: smtp.username,
        password,
        requireTls: smtp.require_tls,
      }),
      sender: row.senderAddress,
      senderDisplayName: row.senderDisplayName ?? undefined,
      transportKind: 'smtp',
    };
  }
  if (deps.env.MAILER_DEFAULT_TRANSPORT === 'smtp') {
    if (!deps.env.MAILER_DEFAULT_SMTP_URL) {
      throw new MailerError('TRANSPORT_UNCONFIGURED', 'MAILER_DEFAULT_SMTP_URL not set');
    }
    return {
      transport: createSmtpTransportFromUrl(deps.env.MAILER_DEFAULT_SMTP_URL),
      sender: deps.env.MAILER_DEFAULT_SENDER,
      senderDisplayName: deps.env.MAILER_DEFAULT_SENDER_DISPLAY_NAME,
      transportKind: 'operator-smtp',
    };
  }
  return {
    transport: createDevStubTransport(),
    sender: deps.env.MAILER_DEFAULT_SENDER,
    senderDisplayName: deps.env.MAILER_DEFAULT_SENDER_DISPLAY_NAME,
    transportKind: 'operator-dev-stub',
  };
}
