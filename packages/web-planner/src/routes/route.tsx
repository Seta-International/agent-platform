import { useSession } from '@seta/web-identity';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { ReconnectingBanner } from '../components/reconnecting-banner';
import { useBoardStream } from '../hooks/use-board-stream';

export const Route = createFileRoute('/_authed/planner')({
  component: PlannerShell,
});

function PlannerShell() {
  const session = useSession();
  useBoardStream(session.accessible_group_ids as string[]);
  return (
    <>
      <ReconnectingBanner />
      <Outlet />
    </>
  );
}
