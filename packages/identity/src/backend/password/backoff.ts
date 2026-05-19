import { sql } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';

// failures 1-2 = 0s, 3 = 1s, 4 = 5s, 5 = 30s, 6-10 = 1min, 11+ = 5min
// Sliding 15-minute window per (lower(email), ip).
const SCHEDULE = [0, 0, 0, 1, 5, 30, 60, 60, 60, 60, 60, 300];

export async function computeBackoffSeconds(email: string, ip: string): Promise<number> {
  const res = await identityDb().execute(sql`
    SELECT count(*)::int AS n
    FROM identity.failed_login_attempts
    WHERE lower(email) = lower(${email}) AND ip = ${ip}
      AND attempted_at > now() - interval '15 minutes'
  `);
  const n = (res.rows[0] as { n: number } | undefined)?.n ?? 0;
  const idx = Math.min(n, SCHEDULE.length - 1);
  return SCHEDULE[idx] as number;
}

export async function recordFailedAttempt(
  email: string,
  ip: string,
  reason: string,
): Promise<void> {
  await identityDb().execute(sql`
    INSERT INTO identity.failed_login_attempts (email, ip, reason)
    VALUES (${email.toLowerCase()}, ${ip}, ${reason})
  `);
}
