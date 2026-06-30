/* eslint-disable react-refresh/only-export-components -- hook and provider co-located; separating them would require an extra file for a single re-export */
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { fetchMe, type SessionScopeProjection } from '../api/client.ts';

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
  const [session, setSession] = useState(initialSession);

  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

  const refreshSession = useCallback(async () => {
    const next = await fetchMe();
    if (next) setSession(next);
    return next;
  }, []);

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
