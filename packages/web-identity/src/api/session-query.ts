import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { fetchMe, type SessionScopeProjection } from './client.ts';

export const sessionQueryKey = ['identity', 'me'] as const;

// Session freshness is event-driven: the shell invalidates this query on SSE
// notification events. staleTime only bounds focus/remount refetches between events.
export const sessionQueryOptions = queryOptions({
  queryKey: sessionQueryKey,
  queryFn: ({ signal }) => fetchMe(signal),
  staleTime: 60_000,
});

// Route-guard entry point: resolves the session through the shared query cache so
// navigations and hover preloads that re-run beforeLoad don't re-hit /identity/v1/me.
export async function ensureSession(
  queryClient: QueryClient,
): Promise<SessionScopeProjection | null> {
  const session = await queryClient.ensureQueryData(sessionQueryOptions);
  if (!session) {
    // Never cache "signed out": a lingering null would bounce the post-login
    // SPA navigation straight back to /login.
    queryClient.removeQueries({ queryKey: sessionQueryKey });
    return null;
  }
  return session;
}
