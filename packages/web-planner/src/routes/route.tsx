import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ReconnectingBanner } from '../components/reconnecting-banner';
import { useMyGroups } from '../hooks/queries/use-my-groups';
import { useBoardStream } from '../hooks/use-board-stream';
import { plannerKeys } from '../state/query-keys';

export const Route = createFileRoute('/_authed/planner')({
  component: PlannerShell,
});

function PlannerShell() {
  const qc = useQueryClient();
  const myGroupsQ = useMyGroups();
  const accessibleGroupIds = (myGroupsQ.data ?? []).map((g) => g.id);
  const accessibleGroupIdsKey = accessibleGroupIds.join(',');
  useBoardStream(accessibleGroupIds);
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
