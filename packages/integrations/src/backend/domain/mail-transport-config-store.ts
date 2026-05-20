import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  type GraphTransportConfig,
  mailTransportConfig,
  type SmtpTransportConfigEncrypted,
  type TransportConfigKind,
  type TransportConfigPayload,
} from '../../db/schema/index.ts';

export interface MailTransportConfigRow {
  tenantId: string;
  kind: TransportConfigKind;
  senderAddress: string;
  senderDisplayName: string | null;
  config: TransportConfigPayload;
  enabled: boolean;
  lastVerifiedAt: Date | null;
  lastVerifyError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertMailTransportConfigInput {
  tenantId: string;
  kind: TransportConfigKind;
  senderAddress: string;
  senderDisplayName: string | null;
  config: TransportConfigPayload;
  actorUserId: number;
}

export interface MailTransportConfigStore {
  findEnabled(tenantId: string): Promise<MailTransportConfigRow | null>;
  upsert(input: UpsertMailTransportConfigInput): Promise<void>;
  disable(tenantId: string, actorUserId: number): Promise<void>;
  recordVerification(
    tenantId: string,
    result: { ok: true } | { ok: false; error: string },
  ): Promise<void>;
}

export interface CreateMailTransportConfigStoreDeps {
  db: NodePgDatabase<Record<string, unknown>>;
}

export function createMailTransportConfigStore(
  deps: CreateMailTransportConfigStoreDeps,
): MailTransportConfigStore {
  const { db } = deps;
  return {
    async findEnabled(tenantId) {
      const [row] = await db
        .select()
        .from(mailTransportConfig)
        .where(
          and(eq(mailTransportConfig.tenantId, tenantId), eq(mailTransportConfig.enabled, true)),
        )
        .limit(1);
      return row ?? null;
    },
    async upsert(input) {
      await db
        .insert(mailTransportConfig)
        .values({
          tenantId: input.tenantId,
          kind: input.kind,
          senderAddress: input.senderAddress,
          senderDisplayName: input.senderDisplayName,
          config: input.config,
          enabled: true,
          createdBy: input.actorUserId,
          updatedBy: input.actorUserId,
        })
        .onConflictDoUpdate({
          target: mailTransportConfig.tenantId,
          set: {
            kind: input.kind,
            senderAddress: input.senderAddress,
            senderDisplayName: input.senderDisplayName,
            config: input.config,
            enabled: true,
            updatedAt: sql`now()`,
            updatedBy: input.actorUserId,
            lastVerifiedAt: null,
            lastVerifyError: null,
          },
        });
    },
    async disable(tenantId, actorUserId) {
      await db
        .update(mailTransportConfig)
        .set({ enabled: false, updatedAt: sql`now()`, updatedBy: actorUserId })
        .where(eq(mailTransportConfig.tenantId, tenantId));
    },
    async recordVerification(tenantId, result) {
      await db
        .update(mailTransportConfig)
        .set(
          result.ok
            ? { lastVerifiedAt: sql`now()`, lastVerifyError: null }
            : { lastVerifyError: result.error },
        )
        .where(eq(mailTransportConfig.tenantId, tenantId));
    },
  };
}

export type { GraphTransportConfig, SmtpTransportConfigEncrypted };
