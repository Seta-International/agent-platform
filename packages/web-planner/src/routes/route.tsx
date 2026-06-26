import { useSession } from '@seta/web-identity';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ReconnectingBanner } from '../components/reconnecting-banner';
import { useBoardStream } from '../hooks/use-board-stream';
import { plannerKeys } from '../state/query-keys';

export const Route = createFileRoute('/_authed/planner')({
  component: PlannerShell,
});

function PlannerShell() {
  const session = useSession();
  const qc = useQueryClient();
  const accessibleGroupIdsKey = session.accessible_group_ids.join(',');
  useBoardStream(session.accessible_group_ids as string[]);
  useEffect(() => {
    void accessibleGroupIdsKey;
    void qc.invalidateQueries({ queryKey: plannerKeys.myGroups() });
    void qc.invalidateQueries({ queryKey: plannerKeys.groupsWithCounts() });
  }, [accessibleGroupIdsKey, qc]);
  return (
    <>
      <ReconnectingBanner />
      <Outlet />
    </>
  );
}
