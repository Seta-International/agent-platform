/* eslint-disable react-refresh/only-export-components -- hook and provider co-located; separating them would require an extra file for a single re-export */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, use, useCallback, useMemo, useRef } from 'react';
import type { SessionScopeProjection } from '../api/client.ts';
import { sessionQueryKey, sessionQueryOptions } from '../api/session-query.ts';

interface SessionContextValue {
  session: SessionScopeProjection;
  refreshSession: () => Promise<SessionScopeProjection | null>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  session: initialSession,
  children,
}: {
  session: SessionScopeProjection;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  // The shared session query cache is the source of truth; the prop only seeds it
  // when nothing resolved the session yet (route guards normally already have).
  const { data } = useQuery({ ...sessionQueryOptions, initialData: initialSession });

  // A refresh can come back 401 (session revoked mid-flight); keep serving the last
  // known session — the next navigation's route guard handles the redirect to /login.
  const lastSessionRef = useRef(initialSession);
  if (data) lastSessionRef.current = data;
  const session = data ?? lastSessionRef.current;

  const refreshSession = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    return queryClient.getQueryData<SessionScopeProjection | null>(sessionQueryKey) ?? null;
  }, [queryClient]);

  const value = useMemo(() => ({ session, refreshSession }), [session, refreshSession]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionScopeProjection {
  const v = use(SessionContext);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v.session;
}

export function useRefreshSession(): () => Promise<SessionScopeProjection | null> {
  const v = use(SessionContext);
  if (!v) throw new Error('useRefreshSession outside SessionProvider');
  return v.refreshSession;
}
