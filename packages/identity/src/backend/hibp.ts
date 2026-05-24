import { createHash } from 'node:crypto';
import pino from 'pino';

const log = pino({ name: 'identity/hibp' });

export async function hibpCheck(password: string): Promise<boolean> {
  // SHA-1 is mandated by the HIBP k-anonymity API contract (range/{first5}); it is a
  // lookup key over the wire, not a stored password hash. Storage uses argon2id.
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'seta-identity/1.0' },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      log.warn({ status: res.status }, 'hibp_outage_allowed');
      return false;
    }
    const body = await res.text();
    for (const line of body.split('\n')) {
      const [hashSuffix, countStr] = line.split(':');
      if (hashSuffix === suffix && parseInt(countStr ?? '0', 10) > 0) return true;
    }
    return false;
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'hibp_outage_allowed');
    return false;
  }
}
