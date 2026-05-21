import {
  ComingSoon,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@seta/shared-ui';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { SessionScopeProjection } from '@/modules/identity/api/client';
import { CreatePlanDialog } from '../components/CreatePlanDialog';
import { GroupDetailHeader } from '../components/GroupDetailHeader';
import { GroupMembersTable } from '../components/GroupMembersTable';
import { GroupPlansSection, THEME_HEX } from '../components/GroupPlansSection';
import { GroupRail } from '../components/GroupRail';
import { GroupStatRow } from '../components/GroupStatRow';
import { RenameGroupDialog } from '../components/RenameGroupDialog';
import { useSetMemberRole } from '../hooks/mutations/set-member-role';
import { useGroup } from '../hooks/queries/use-group';
import { useGroupMembers } from '../hooks/queries/use-group-members';
import { useGroupPlans } from '../hooks/queries/use-group-plans';

export type GroupTab = 'plans' | 'members' | 'activity' | 'labels' | 'integrations' | 'settings';

// Re-export for route and tests
export type { SessionScopeProjection as GroupDetailSession };

interface Props {
  groupId: string;
  tab: GroupTab;
  onTabChange: (next: GroupTab) => void;
  session: SessionScopeProjection;
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-7" data-testid="skeleton-detail">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mt-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

interface ErrorStateProps {
  onRetry: () => void;
}

function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 gap-4" role="alert">
      <p className="text-body-sm text-ink-subtle">Couldn&apos;t load this group.</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm text-primary underline hover:no-underline"
      >
        Retry
      </button>
    </div>
  );
}

export function GroupDetailPage({ groupId, tab, onTabChange, session }: Props) {
  const groupQuery = useGroup(groupId);
  const membersQuery = useGroupMembers(groupId);
  const plansQuery = useGroupPlans(groupId);
  const setMemberRoleMutation = useSetMemberRole(groupId);
  const navigate = useNavigate();

  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  // Capability checks
  const roles = session.role_summary.roles;
  const isAdmin =
    roles.includes('org.admin') ||
    roles.includes('tenant.admin') ||
    roles.includes('planner.admin');
  const members = membersQuery.data ?? [];
  const isOwner = members.some((m) => m.user_id === session.user_id && m.role === 'owner');
  const canManage = isAdmin || isOwner;
  const canCreatePlan = canManage;
  const canManageRoles = canManage;

  if (groupQuery.isPending || membersQuery.isPending || plansQuery.isPending) {
    return <DetailSkeleton />;
  }

  if (groupQuery.isError) {
    // 403 → redirect to groups list
    const err = groupQuery.error as { status?: number } | null;
    if (err?.status === 403) {
      void navigate({ to: '/planner/groups' });
      toast.error('You no longer have access to this group.');
      return null;
    }
    return <ErrorState onRetry={() => void groupQuery.refetch()} />;
  }

  if (!groupQuery.data) {
    // Shouldn't normally happen after !isPending && !isError, but guard anyway
    return <Navigate to="/planner/groups" />;
  }

  const group = groupQuery.data;
  const plans = plansQuery.data ?? [];
  const themeColor = THEME_HEX[group.theme as keyof typeof THEME_HEX] ?? THEME_HEX.blue;

  function handleMenuAction(action: 'archive' | 'delete') {
    // Placeholder — full implementation in a follow-up PR
    toast(`${action === 'archive' ? 'Archive' : 'Delete'} functionality coming soon.`);
  }

  return (
    <div className="flex h-full flex-col">
      <GroupDetailHeader
        group={group}
        canManage={canManage}
        onRenameClick={() => setRenameOpen(true)}
        onInviteClick={() => toast('Invite functionality coming soon.')}
        onCreatePlanClick={() => setCreatePlanOpen(true)}
        onMenuAction={handleMenuAction}
      />
      <div className="px-7">
        <GroupStatRow planCount={plans.length} openTaskCount={0} memberCount={members.length} />
      </div>
      <Tabs
        value={tab}
        onValueChange={(t) => onTabChange(t as GroupTab)}
        className="flex flex-1 min-h-0 flex-col"
      >
        <TabsList className="border-b border-hairline px-7 justify-start gap-1 bg-transparent rounded-none">
          <TabsTrigger value="plans">
            Plans <span className="ml-1.5 text-xs text-ink-subtle">{plans.length}</span>
          </TabsTrigger>
          <TabsTrigger value="members">
            Members <span className="ml-1.5 text-xs text-ink-subtle">{members.length}</span>
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="labels">Labels</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          {canManage ? <TabsTrigger value="settings">Settings</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="plans" className="flex-1 overflow-auto bg-surface-1">
          <div className="mx-auto max-w-[1240px] px-7 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <GroupPlansSection
              groupName={group.name}
              plans={plans}
              themeColor={themeColor}
              canCreatePlan={canCreatePlan}
              onCreatePlan={() => setCreatePlanOpen(true)}
              onPlanClick={(planId) =>
                void navigate({
                  to: '/planner/plans/$planId',
                  params: { planId },
                })
              }
            />
            <GroupRail
              group={group}
              members={members}
              canManage={canManage}
              onAddMember={() => toast('Invite functionality coming soon.')}
            />
          </div>
        </TabsContent>

        <TabsContent value="members" className="flex-1 overflow-auto bg-surface-1">
          <div className="mx-auto max-w-[1240px] px-7 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <GroupMembersTable
              group={group}
              members={members}
              canManageRoles={canManageRoles}
              onRoleChange={(v) => setMemberRoleMutation.mutate(v)}
            />
            <GroupRail
              group={group}
              members={members}
              canManage={canManage}
              onAddMember={() => toast('Invite functionality coming soon.')}
            />
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <ComingSoon feature="Activity" />
        </TabsContent>
        <TabsContent value="labels">
          <ComingSoon feature="Labels" />
        </TabsContent>
        <TabsContent value="integrations">
          <ComingSoon feature="Integrations" />
        </TabsContent>

        {canManage ? (
          <TabsContent value="settings" className="p-7">
            <div className="text-sm text-ink-subtle">
              Settings tab — actual form coming in a follow-up. PR2 only scaffolds the route.
            </div>
          </TabsContent>
        ) : null}
      </Tabs>

      <CreatePlanDialog groupId={groupId} open={createPlanOpen} onOpenChange={setCreatePlanOpen} />
      <RenameGroupDialog
        groupId={groupId}
        currentName={group.name}
        version={group.version}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
    </div>
  );
}
