/* eslint-disable react-refresh/only-export-components -- hook and provider co-located; separating them would require an extra file for a single re-export */
import { createContext, type ReactNode, useContext } from 'react';
import type { SessionScopeProjection } from '../api/client.ts';

const SessionContext = createContext<SessionScopeProjection | null>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: SessionScopeProjection;
  children: ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionScopeProjection {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
