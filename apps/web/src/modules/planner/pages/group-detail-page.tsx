import { EmptyState, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@seta/shared-ui';
import { Link } from '@tanstack/react-router';
import { useGroup } from '../hooks/queries/use-group';
import { useGroupMembers } from '../hooks/queries/use-group-members';
import { useGroupPlans } from '../hooks/queries/use-group-plans';

export type GroupDetailTab = 'plans' | 'members' | 'settings';

export interface GroupDetailSession {
  role_summary: { roles: string[]; cross_tenant_read: boolean };
  accessible_group_ids: ReadonlyArray<string>;
}

interface Props {
  groupId: string;
  tab: GroupDetailTab;
  onTabChange: (tab: GroupDetailTab) => void;
  session: GroupDetailSession;
}

function canManageGroup(session: GroupDetailSession, groupId: string): boolean {
  const roles = session.role_summary.roles;
  if (roles.includes('org.admin') || roles.includes('tenant.admin')) return true;
  return roles.includes('planner.admin') && session.accessible_group_ids.includes(groupId);
}

export function GroupDetailPage({ groupId, tab, onTabChange, session }: Props) {
  const groupQ = useGroup(groupId);
  const plansQ = useGroupPlans(groupId);
  const membersQ = useGroupMembers(groupId);
  const showSettings = canManageGroup(session, groupId);

  if (groupQ.isPending) {
    return <Skeleton data-testid="skeleton-detail" className="m-6 h-24 w-full" />;
  }
  if (groupQ.isError) {
    return (
      <div role="alert" className="m-6">
        Couldn't load this group.
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-display-md text-ink mb-4">{groupQ.data.name}</h1>
      <Tabs value={tab} onValueChange={(v) => onTabChange(v as GroupDetailTab)}>
        <TabsList>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          {showSettings && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>

        <TabsContent value="plans">
          {plansQ.isPending && (
            <Skeleton data-testid="skeleton-plans" className="mt-4 h-16 w-full" />
          )}
          {plansQ.data?.length === 0 && (
            <EmptyState
              title="Create your first plan"
              description="A plan groups buckets and tasks for one stream of work."
            />
          )}
          {plansQ.data && plansQ.data.length > 0 && (
            <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {plansQ.data.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/planner/groups/$groupId"
                    params={{ groupId }}
                    className="block rounded-md border border-surface-3 bg-surface-1 p-4 hover:border-primary"
                  >
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="members">
          {membersQ.isPending && (
            <Skeleton data-testid="skeleton-members" className="mt-4 h-16 w-full" />
          )}
          {membersQ.data && (
            <table className="mt-4 w-full text-left text-body-sm">
              <thead className="text-ink-subtle">
                <tr>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2">Added</th>
                </tr>
              </thead>
              <tbody>
                {membersQ.data.map((m) => (
                  <tr key={m.user_id} className="border-t border-surface-3">
                    <td className="py-2 pr-4">{m.display_name}</td>
                    <td className="py-2 pr-4">{m.email}</td>
                    <td className="py-2">{new Date(m.added_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>

        {showSettings && (
          <TabsContent value="settings">
            <p className="mt-4 text-ink-subtle">Group settings — rename, archive — coming soon.</p>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
