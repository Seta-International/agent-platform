import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useSession } from '@/modules/identity/components/SessionProvider';
import { ReconnectingBanner } from '@/modules/planner/components/reconnecting-banner';
import { useBoardStream } from '@/modules/planner/hooks/use-board-stream';

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
