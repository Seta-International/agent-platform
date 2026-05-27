import { sql } from 'drizzle-orm';
import { copilotDb } from './db/index.ts';

const WINDOW_MS = 60_000;

export class RateLimitError extends Error {
  constructor(
    public readonly code: 'rate_limited',
    public readonly retryAfterSeconds: number,
  ) {
    super(`rate limited; retry in ${retryAfterSeconds}s`);
    this.name = 'RateLimitError';
  }
}

export type RateLimitReservation = {
  tenantId: string;
  userId: string;
  windowStart: Date;
  estimatedTokensIn: number;
};

function floorToSecond(d: Date): Date {
  return new Date(Math.floor(d.getTime() / 1_000) * 1_000);
}

type UsageBucket = {
  window_start: Date;
  tokens_in: number;
  tokens_out: number;
  turns: number;
};

function rowsOf<T>(res: unknown): T[] {
  return ((res as { rows?: T[] }).rows ?? (res as T[])) as T[];
}

function retryAfterSeconds(args: {
  now: Date;
  buckets: UsageBucket[];
  estimatedTokens: number;
  turnLimit: number;
  tpmLimit: number;
}): number {
  let turns = args.buckets.reduce((sum, row) => sum + row.turns, 0);
  let tokens = args.buckets.reduce((sum, row) => sum + row.tokens_in + row.tokens_out, 0);

  for (const bucket of args.buckets) {
    turns -= bucket.turns;
    tokens -= bucket.tokens_in + bucket.tokens_out;
    if (turns + 1 <= args.turnLimit && tokens + args.estimatedTokens <= args.tpmLimit) {
      const windowStart =
        bucket.window_start instanceof Date ? bucket.window_start : new Date(bucket.window_start);
      const expiresAt = windowStart.getTime() + WINDOW_MS;
      return Math.max(1, Math.ceil((expiresAt - args.now.getTime()) / 1_000));
    }
  }

  return Math.ceil(WINDOW_MS / 1_000);
}

export async function reserveTurn(args: {
  tenantId: string;
  userId: string;
  estimatedTokens: number;
  turnLimit: number;
  tpmLimit: number;
  now?: Date;
}): Promise<RateLimitReservation> {
  const db = copilotDb();
  const now = args.now ?? new Date();
  const windowStart = floorToSecond(now);
  const activeFrom = new Date(now.getTime() - WINDOW_MS);

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtext(${args.tenantId}), hashtext(${args.userId}))
    `);

    const active = await tx.execute(sql`
      SELECT window_start, tokens_in, tokens_out, turns
        FROM copilot.rate_limits
       WHERE tenant_id = ${args.tenantId}
         AND user_id = ${args.userId}
         AND window_start > ${activeFrom}
         AND window_start <= ${windowStart}
       ORDER BY window_start ASC
    `);
    const buckets = rowsOf<UsageBucket>(active);
    const turns = buckets.reduce((sum, row) => sum + row.turns, 0);
    const tokens = buckets.reduce((sum, row) => sum + row.tokens_in + row.tokens_out, 0);

    if (turns + 1 > args.turnLimit || tokens + args.estimatedTokens > args.tpmLimit) {
      throw new RateLimitError(
        'rate_limited',
        retryAfterSeconds({
          now,
          buckets,
          estimatedTokens: args.estimatedTokens,
          turnLimit: args.turnLimit,
          tpmLimit: args.tpmLimit,
        }),
      );
    }

    await tx.execute(sql`
      INSERT INTO copilot.rate_limits
        (tenant_id, user_id, window_start, tokens_in, tokens_out, turns)
      VALUES
        (${args.tenantId}, ${args.userId}, ${windowStart}, ${args.estimatedTokens}, 0, 1)
      ON CONFLICT (tenant_id, user_id, window_start)
      DO UPDATE SET
        tokens_in = copilot.rate_limits.tokens_in + EXCLUDED.tokens_in,
        turns = copilot.rate_limits.turns + EXCLUDED.turns
    `);
  });

  return {
    tenantId: args.tenantId,
    userId: args.userId,
    windowStart,
    estimatedTokensIn: args.estimatedTokens,
  };
}

export async function commitActualTokens(args: {
  tenantId: string;
  userId: string;
  reservationWindowStart: Date;
  estimatedTokensIn: number;
  actualTokensIn: number;
  actualTokensOut: number;
}): Promise<void> {
  const db = copilotDb();
  const delta = args.actualTokensIn - args.estimatedTokensIn;
  const res = await db.execute(sql`
    UPDATE copilot.rate_limits
       SET tokens_in = tokens_in + ${delta},
           tokens_out = tokens_out + ${args.actualTokensOut}
     WHERE tenant_id = ${args.tenantId}
       AND user_id = ${args.userId}
       AND window_start = ${args.reservationWindowStart}
     RETURNING window_start
  `);

  const rows = rowsOf<{ window_start: Date }>(res);
  if (rows.length === 0) {
    console.warn('[copilot.rate-limit.commit.missing-row]', {
      tenantId: args.tenantId,
      userId: args.userId,
      reservationWindowStart: args.reservationWindowStart,
    });
    return;
  }

  console.info('[copilot.rate-limit.commit]', {
    tenantId: args.tenantId,
    userId: args.userId,
    estimatedIn: args.estimatedTokensIn,
    actualIn: args.actualTokensIn,
    actualOut: args.actualTokensOut,
    delta,
  });
}
