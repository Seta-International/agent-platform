import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  type OutgoingEmailStatus,
  outgoingEmails,
  type TransportKind,
} from '../db/schema/index.ts';

export interface OutboxRow {
  id: string;
  tenantId: string;
  dedupeKey: string;
  template: string;
  toAddress: string;
  propsHash: string;
  transportKind: TransportKind | null;
  status: OutgoingEmailStatus;
  attempts: number;
  lastError: string | null;
  lastErrorAt: Date | null;
  transportMessageId: string | null;
  createdAt: Date;
  sentAt: Date | null;
}

export interface UpsertPendingInput {
  tenantId: string;
  dedupeKey: string;
  template: string;
  toAddress: string;
  propsHash: string;
}

export interface OutboxStore {
  upsertPending(input: UpsertPendingInput): Promise<{ id: string; deduped: boolean }>;
  findById(id: string): Promise<OutboxRow | null>;
  markSent(
    id: string,
    fields: { transportKind: TransportKind; transportMessageId: string | null },
  ): Promise<void>;
  markFailedTransient(
    id: string,
    fields: { transportKind: TransportKind; error: string },
  ): Promise<void>;
  markPermanentlyFailed(
    id: string,
    fields: { transportKind: TransportKind; errorCode: string; error: string },
  ): Promise<void>;
}

export interface CreateOutboxStoreDeps {
  db: NodePgDatabase<Record<string, unknown>>;
}

export function createOutboxStore(deps: CreateOutboxStoreDeps): OutboxStore {
  const { db } = deps;
  return {
    async upsertPending(input) {
      const [inserted] = await db
        .insert(outgoingEmails)
        .values({
          tenantId: input.tenantId,
          dedupeKey: input.dedupeKey,
          template: input.template,
          toAddress: input.toAddress,
          propsHash: input.propsHash,
        })
        .onConflictDoNothing({
          target: [outgoingEmails.tenantId, outgoingEmails.dedupeKey],
        })
        .returning({ id: outgoingEmails.id });
      if (inserted) return { id: inserted.id, deduped: false };
      const [existing] = await db
        .select({ id: outgoingEmails.id })
        .from(outgoingEmails)
        .where(
          and(
            eq(outgoingEmails.tenantId, input.tenantId),
            eq(outgoingEmails.dedupeKey, input.dedupeKey),
          ),
        )
        .limit(1);
      if (!existing) throw new Error('outbox upsert race: row missing after conflict');
      return { id: existing.id, deduped: true };
    },
    async findById(id) {
      const [row] = await db
        .select()
        .from(outgoingEmails)
        .where(eq(outgoingEmails.id, id))
        .limit(1);
      return row ?? null;
    },
    async markSent(id, { transportKind, transportMessageId }) {
      await db
        .update(outgoingEmails)
        .set({
          status: 'sent',
          transportKind,
          transportMessageId,
          sentAt: sql`now()`,
          attempts: sql`${outgoingEmails.attempts} + 1`,
        })
        .where(eq(outgoingEmails.id, id));
    },
    async markFailedTransient(id, { transportKind, error }) {
      await db
        .update(outgoingEmails)
        .set({
          transportKind,
          lastError: error,
          lastErrorAt: sql`now()`,
          attempts: sql`${outgoingEmails.attempts} + 1`,
        })
        .where(eq(outgoingEmails.id, id));
    },
    async markPermanentlyFailed(id, { transportKind, error }) {
      await db
        .update(outgoingEmails)
        .set({
          status: 'permanently_failed',
          transportKind,
          lastError: error,
          lastErrorAt: sql`now()`,
          attempts: sql`${outgoingEmails.attempts} + 1`,
        })
        .where(eq(outgoingEmails.id, id));
    },
  };
}
