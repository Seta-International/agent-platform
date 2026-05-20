import { and, eq, sql } from 'drizzle-orm';
import { copilotDb } from '../db/index.ts';
import { hitlCalls } from '../db/schema.ts';

export class HitlError extends Error {
  constructor(
    public readonly code: 'not_found' | 'hitl_expired' | 'internal',
    message: string,
  ) {
    super(message);
    this.name = 'HitlError';
  }
}

export type InsertHitlInput = {
  callId: string;
  threadId: string;
  tenantId: string;
  userId: string;
  toolName: string;
  input: unknown;
  requiredPermission: string;
  expiresAt: Date;
};

export async function insertHitl(input: InsertHitlInput): Promise<void> {
  const db = copilotDb();
  await db
    .insert(hitlCalls)
    .values({
      callId: input.callId,
      threadId: input.threadId,
      tenantId: input.tenantId,
      userId: input.userId,
      toolName: input.toolName,
      input: input.input as never,
      requiredPermission: input.requiredPermission,
      expiresAt: input.expiresAt,
      status: 'pending',
      requestedAt: new Date(),
    })
    .onConflictDoNothing();
}

export type ApproveOutcome = { status: 'approved'; outcome: unknown };

export async function approveHitl(args: {
  callId: string;
  userId: string;
  outcome: unknown;
}): Promise<ApproveOutcome> {
  const db = copilotDb();
  const [existing] = await db
    .select()
    .from(hitlCalls)
    .where(and(eq(hitlCalls.callId, args.callId), eq(hitlCalls.userId, args.userId)));
  if (!existing) throw new HitlError('not_found', 'hitl call not found');
  if (existing.status === 'approved') {
    return { status: 'approved', outcome: existing.outcome };
  }
  if (existing.status !== 'pending') {
    throw new HitlError('hitl_expired', `hitl call already ${existing.status}`);
  }
  const [row] = await db
    .update(hitlCalls)
    .set({ status: 'approved', outcome: args.outcome as never, resolvedAt: new Date() })
    .where(and(eq(hitlCalls.callId, args.callId), eq(hitlCalls.status, 'pending')))
    .returning();
  if (!row) throw new HitlError('hitl_expired', 'lost race');
  return { status: 'approved', outcome: row.outcome };
}

export async function rejectHitl(args: {
  callId: string;
  userId: string;
  note?: string;
}): Promise<{ status: 'rejected' }> {
  const db = copilotDb();
  const [existing] = await db
    .select()
    .from(hitlCalls)
    .where(and(eq(hitlCalls.callId, args.callId), eq(hitlCalls.userId, args.userId)));
  if (!existing) throw new HitlError('not_found', 'hitl call not found');
  if (existing.status === 'rejected') return { status: 'rejected' };
  if (existing.status !== 'pending') {
    throw new HitlError('hitl_expired', `hitl call already ${existing.status}`);
  }
  await db
    .update(hitlCalls)
    .set({
      status: 'rejected',
      outcome: { note: args.note ?? null } as never,
      resolvedAt: new Date(),
    })
    .where(and(eq(hitlCalls.callId, args.callId), eq(hitlCalls.status, 'pending')));
  return { status: 'rejected' };
}

export async function expireHitl(args: { callId: string }): Promise<void> {
  const db = copilotDb();
  await db
    .update(hitlCalls)
    .set({ status: 'expired', resolvedAt: new Date() })
    .where(and(eq(hitlCalls.callId, args.callId), eq(hitlCalls.status, 'pending')));
}

export async function findPendingExpired(): Promise<Array<{ callId: string; threadId: string }>> {
  const db = copilotDb();
  return db
    .select({ callId: hitlCalls.callId, threadId: hitlCalls.threadId })
    .from(hitlCalls)
    .where(and(eq(hitlCalls.status, 'pending'), sql`${hitlCalls.expiresAt} <= now()`));
}
