import { timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';

export type PeerAuthOpts = { kind: 'bearer'; secret: string } | { kind: 'mtls' };

export function peerAuth(opts: PeerAuthOpts) {
  if (opts.kind === 'bearer') {
    if (!opts.secret) throw new Error('peerAuth(bearer): secret is required');
    if (opts.secret.length < 32) {
      throw new Error('peerAuth(bearer): secret must be at least 32 characters');
    }
  }

  return createMiddleware(async (c, next) => {
    if (opts.kind === 'bearer') {
      const header = c.req.header('Authorization');
      if (!header || !header.startsWith('Bearer ')) return c.json({ error: 'unauthorized' }, 401);
      const provided = header.slice('Bearer '.length);
      if (provided.length !== opts.secret.length) {
        return c.json({ error: 'unauthorized' }, 401);
      }
      const a = Buffer.from(provided);
      const b = Buffer.from(opts.secret);
      if (!timingSafeEqual(a, b)) return c.json({ error: 'unauthorized' }, 401);
      return next();
    }
    if (c.req.header('X-Client-Cert-Verified') !== 'SUCCESS') {
      return c.json({ error: 'unauthorized' }, 401);
    }
    return next();
  });
}
