import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.COPILOT_SSE_TOKEN_SECRET ?? randomBytes(32).toString('hex');
const TTL_MS = 5 * 60 * 1000;

export function issueSseToken(payload: { userId: string; tenantId: string }): string {
  const expiresAt = Date.now() + TTL_MS;
  const body = `${payload.userId}.${payload.tenantId}.${expiresAt}`;
  const sig = createHmac('sha256', SECRET).update(body).digest('hex');
  return Buffer.from(`${body}.${sig}`, 'utf8').toString('base64url');
}

export interface SseTokenClaims {
  userId: string;
  tenantId: string;
}

export function verifySseToken(token: string): SseTokenClaims | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parts = raw.split('.');
    if (parts.length !== 4) return null;
    const [userId, tenantId, expiresAtStr, sig] = parts as [string, string, string, string];
    const body = `${userId}.${tenantId}.${expiresAtStr}`;
    const expected = createHmac('sha256', SECRET).update(body).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
    const expiresAt = Number(expiresAtStr);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
    return { userId, tenantId };
  } catch {
    // catch covers buffer/base64 decode failures — same response as a forged token: reject.
    return null;
  }
}
