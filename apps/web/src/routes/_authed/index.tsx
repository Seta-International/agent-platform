import { useSession } from '@seta/web-identity';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { fetchEnabledModules } from '@/shell/enabled-modules.ts';
import { resolveLanding } from '@/shell/last-app.ts';
import { visibleManifests } from '@/shell/manifest-registry.ts';
import { ALL_MANIFESTS } from '@/shell/manifests.ts';

function Landing() {
  const session = useSession();

  const enabledQuery = useQuery({
    queryKey: ['shell', 'enabled-modules'],
    queryFn: ({ signal }) => fetchEnabledModules(signal),
    staleTime: 60_000,
  });

  const permittedAppIds = useMemo(() => {
    const enabled = new Set(enabledQuery.data?.enabled ?? ALL_MANIFESTS.map((m) => m.id));
    return visibleManifests(
      ALL_MANIFESTS,
      {
        permissions: new Set(session.permissions),
        features: new Set(session.features),
        product_access: new Set(session.product_access),
      },
      enabled,
    ).map((m) => m.id);
  }, [enabledQuery.data, session.permissions, session.features, session.product_access]);

  const dest = resolveLanding(session.user_id, permittedAppIds);

  if (dest && dest !== '/') return <Navigate to={dest as '/'} replace />;

  return (
    <div className="space-y-2 p-xl">
      <p className="text-muted-foreground">No apps available — ask your admin.</p>
    </div>
  );
}

export const Route = createFileRoute('/_authed/')({ component: Landing });
