import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { useSession } from '@/modules/identity/components/SessionProvider';
import { GroupDetailPage } from '@/modules/planner/pages/group-detail-page';

const searchSchema = z.object({
  tab: z.enum(['plans', 'members', 'activity', 'integrations', 'settings']).optional(),
});

export const Route = createFileRoute('/_authed/planner/groups_/$groupId')({
  validateSearch: searchSchema,
  component: GroupDetailRoute,
});

function GroupDetailRoute() {
  const { groupId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const session = useSession();
  return (
    <GroupDetailPage
      groupId={groupId}
      tab={tab ?? 'plans'}
      onTabChange={(t) =>
        navigate({
          search: { tab: t === 'plans' ? undefined : t },
        })
      }
      session={session}
    />
  );
}
