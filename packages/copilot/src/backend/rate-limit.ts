import { and, eq, sql } from 'drizzle-orm';
import { copilotDb } from '../db/index.ts';
import { rateLimits } from '../db/schema.ts';

export class RateLimitError extends Error {
  constructor(
    public readonly code: 'rate_limited',
    public readonly retryAfterSeconds: number,
  ) {
    super(`rate limited; retry in ${retryAfterSeconds}s`);
    this.name = 'RateLimitError';
  }
}

function floorToMinute(d: Date): Date {
  return new Date(Math.floor(d.getTime() / 60_000) * 60_000);
}

export async function reserveTurn(args: {
  tenantId: string;
  userId: string;
  estimatedTokens: number;
  turnLimit: number;
  tpmLimit: number;
}): Promise<void> {
  const db = copilotDb();
  const windowStart = floorToMinute(new Date());
  await db
    .insert(rateLimits)
    .values({
      tenantId: args.tenantId,
      userId: args.userId,
      windowStart,
      tokensIn: 0,
      tokensOut: 0,
      turns: 0,
    })
    .onConflictDoNothing();
  const [row] = await db
    .update(rateLimits)
    .set({
      turns: sql`${rateLimits.turns} + 1`,
      tokensIn: sql`${rateLimits.tokensIn} + ${args.estimatedTokens}`,
    })
    .where(
      and(
        eq(rateLimits.tenantId, args.tenantId),
        eq(rateLimits.userId, args.userId),
        eq(rateLimits.windowStart, windowStart),
      ),
    )
    .returning();
  if (!row) {
    throw new RateLimitError('rate_limited', 60);
  }
  if (row.turns > args.turnLimit || row.tokensIn + row.tokensOut > args.tpmLimit) {
    const retry = Math.max(1, Math.ceil(60 - (Date.now() % 60_000) / 1000));
    throw new RateLimitError('rate_limited', retry);
  }
}

export async function commitActualTokens(args: {
  tenantId: string;
  userId: string;
  tokensIn: number;
  tokensOut: number;
}): Promise<void> {
  const db = copilotDb();
  const windowStart = floorToMinute(new Date());
  await db
    .update(rateLimits)
    .set({
      tokensIn: args.tokensIn,
      tokensOut: args.tokensOut,
    })
    .where(
      and(
        eq(rateLimits.tenantId, args.tenantId),
        eq(rateLimits.userId, args.userId),
        eq(rateLimits.windowStart, windowStart),
      ),
    );
}
