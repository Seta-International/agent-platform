import type { PermissionKey } from '@seta/shared-rbac';
import type { ReactNode } from 'react';
import { useSession } from './SessionProvider.tsx';

export function usePermission(permission: PermissionKey): boolean {
  const session = useSession();
  return (session.permissions ?? []).includes(permission);
}

export function Can({ permission, children }: { permission: PermissionKey; children: ReactNode }) {
  return usePermission(permission) ? <>{children}</> : null;
}
