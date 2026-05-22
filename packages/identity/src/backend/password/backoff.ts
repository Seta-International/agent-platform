import { emit, withEmit } from '@seta/core/events';
import { sql } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import {
  IDENTITY_FAILED_LOGIN_ALERT_THRESHOLD_REACHED,
  IDENTITY_FAILED_LOGIN_ALERT_THRESHOLD_REACHED_VERSION,
} from '../../events/failed-login-alert.ts';
import { mintPasswordResetUrlIfKnown } from '../domain/request-password-reset.ts';

// failures 1-2 = 0s, 3 = 1s, 4 = 5s, 5 = 30s, 6-10 = 1min, 11+ = 5min
// Sliding 15-minute window per (lower(email), ip).
const SCHEDULE = [0, 0, 0, 1, 5, 30, 60, 60, 60, 60, 60, 300];
const SYSTEM_TENANT = '00000000-0000-0000-0000-000000000000';

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
  const normalized = email.toLowerCase().trim();
  await identityDb().execute(sql`
    INSERT INTO identity.failed_login_attempts (email, ip, reason)
    VALUES (${normalized}, ${ip}, ${reason})
  `);

  const countRes = await identityDb().execute(sql`
    SELECT count(*)::int AS n
    FROM identity.failed_login_attempts
    WHERE lower(email) = ${normalized}
      AND attempted_at > now() - interval '15 minutes'
  `);
  const windowCount = (countRes.rows[0] as { n: number } | undefined)?.n ?? 0;
  if (windowCount !== 5) return;

  const wonRace = await identityDb().execute(sql`
    INSERT INTO identity.failed_login_alerts_sent (email, last_sent_at)
    VALUES (${normalized}, now())
    ON CONFLICT (email) DO UPDATE
      SET last_sent_at = excluded.last_sent_at
      WHERE failed_login_alerts_sent.last_sent_at < now() - interval '1 hour'
    RETURNING email
  `);
  if (wonRace.rows.length === 0) return;

  const baseUrl = process.env.WEB_BASE_URL?.trim() || 'http://localhost:5173';
  const minted = await mintPasswordResetUrlIfKnown(normalized, baseUrl);
  const resetUrl = minted?.url ?? null;

  const tenantId = (await tenantIdForEmail(normalized)) ?? SYSTEM_TENANT;

  await withEmit({ actor: { userId: 'system', tenantId } }, async () => {
    await emit({
      tenantId,
      aggregateType: 'identity.failed_login_alert',
      aggregateId: normalized,
      eventType: IDENTITY_FAILED_LOGIN_ALERT_THRESHOLD_REACHED,
      eventVersion: IDENTITY_FAILED_LOGIN_ALERT_THRESHOLD_REACHED_VERSION,
      payload: {
        email: normalized,
        ip,
        geo_country: null,
        attempted_at: new Date().toISOString(),
        reset_url: resetUrl,
      },
    });
  });
}

async function tenantIdForEmail(email: string): Promise<string | null> {
  const res = await identityDb().execute(sql`
    SELECT tenant_id::text AS tid FROM identity."user" WHERE lower(email) = ${email} LIMIT 1
  `);
  return (res.rows[0] as { tid: string } | undefined)?.tid ?? null;
}
