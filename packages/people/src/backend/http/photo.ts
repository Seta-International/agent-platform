import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import {
  PHOTO_REDIRECT_CACHE_SECONDS,
  type PhotoPresignDeps,
  workerPhotoDownloadUrl,
} from '../domain/photo.ts';

export function registerPeoplePhotoRoutes(
  app: Hono<SessionEnv>,
  deps: PhotoPresignDeps = {},
): void {
  // Redirect rather than return JSON: an <img src> can point at this path forever and each load
  // re-signs. Cached shorter than the signature it points at, and `private` because the redirect
  // target is a per-tenant object behind the session cookie.
  app.get('/api/people/v1/workers/:id/photo', async (c) => {
    const { download_url } = await workerPhotoDownloadUrl(
      { worker_id: c.req.param('id'), session: c.get('user') },
      deps,
    );
    c.header('cache-control', `private, max-age=${PHOTO_REDIRECT_CACHE_SECONDS}`);
    return c.redirect(download_url, 302);
  });
}
