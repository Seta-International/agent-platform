import type { MiddlewareHandler } from 'hono';

/**
 * Conservative security headers for an API origin that never returns HTML.
 * The web app is served from a different origin (a static bundle), so
 * default-src 'none' on API responses is safe — nothing in an API JSON
 * response should ever load a script or frame.
 */
export const securityHeadersMiddleware: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  c.header(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
};
