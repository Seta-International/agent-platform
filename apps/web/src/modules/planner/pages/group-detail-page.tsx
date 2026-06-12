import type { GroupMemberRow } from '@seta/planner';
import {
  Button,
  ComingSoon,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import type { SessionScopeProjection } from '@/modules/identity/api/client';
import { listJoinRequests, resolveJoinRequest } from '../api/planner-client';
import { ActivityFeedTab } from '../components/ActivityFeedTab';
import { AddGroupMembersDialog } from '../components/AddGroupMembersDialog';
import { ConfirmRemoveMemberDialog } from '../components/ConfirmRemoveMemberDialog';
import { ConfirmRemoveMembersDialog } from '../components/ConfirmRemoveMembersDialog';
import { CreatePlanDialog } from '../components/CreatePlanDialog';
import { DeleteGroupDialog } from '../components/DeleteGroupDialog';
import { GroupDetailHeader } from '../components/GroupDetailHeader';
import { GroupMembersTable } from '../components/GroupMembersTable';
import { GroupPlansSection, THEME_HEX } from '../components/GroupPlansSection';
import { GroupRail } from '../components/GroupRail';
import { EditGroupDialog } from '../components/RenameGroupDialog';
import { useDeleteGroup } from '../hooks/mutations/delete-group';
import { useRemoveGroupMember } from '../hooks/mutations/remove-group-member';
import { useRemoveGroupMembers } from '../hooks/mutations/remove-group-members';
import { useRestoreGroup } from '../hooks/mutations/restore-group';
import { useSetMemberRole } from '../hooks/mutations/set-member-role';
import { useGroup } from '../hooks/queries/use-group';
import { useGroupActivity } from '../hooks/queries/use-group-activity';
import { useGroupMembers } from '../hooks/queries/use-group-members';
import { useGroupPlans } from '../hooks/queries/use-group-plans';
import { useGroupActivityLive } from '../hooks/use-group-activity-live';

export type GroupTab = 'plans' | 'members' | 'activity' | 'integrations' | 'settings';

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
    <div className="flex flex-col gap-4 p-6" data-testid="skeleton-detail">
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
        Try again
      </button>
    </div>
  );
}

export function GroupDetailPage({ groupId, tab, onTabChange, session }: Props) {
  const groupQuery = useGroup(groupId);
  const membersQuery = useGroupMembers(groupId);
  const plansQuery = useGroupPlans(groupId);
  const activityQuery = useGroupActivity(groupId, 7);
  // Keep the rail (and tab) live without a page refresh; the tab adds its own pill on top.
  useGroupActivityLive(groupId);
  const setMemberRoleMutation = useSetMemberRole(groupId);
  const removeGroupMemberMutation = useRemoveGroupMember(groupId);
  const removeGroupMembersMutation = useRemoveGroupMembers(groupId);
  const navigate = useNavigate();
  const deleteGroup = useDeleteGroup(groupId);
  const restoreGroup = useRestoreGroup();

  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<GroupMemberRow | null>(null);
  const [membersToRemove, setMembersToRemove] = useState<string[] | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [archiveM365Open, setArchiveM365Open] = useState(false);
  const [restorePromptOpen, setRestorePromptOpen] = useState(false);
  const hasAutoPrompted = useRef(false);

  useEffect(() => {
    if (groupQuery.data?.deleted_at && !hasAutoPrompted.current) {
      hasAutoPrompted.current = true;
      setRestorePromptOpen(true);
    }
  }, [groupQuery.data?.deleted_at]);

  // Capability checks
  const roles = session.role_summary.roles;
  const isAdmin =
    roles.includes('org.admin') ||
    roles.includes('tenant.admin') ||
    roles.includes('planner.admin');
  const members = membersQuery.data?.members ?? [];
  const memberTotal = membersQuery.data?.total ?? members.length;
  const isOwner = members.some((m) => m.user_id === session.user_id && m.role === 'owner');
  const canManage = isAdmin || isOwner;
  const canCreatePlan = canManage;
  const canManageRoles = canManage;

  const joinRequestsQuery = useQuery({
    queryKey: ['planner', 'join-requests', groupId, 'pending'],
    queryFn: () => listJoinRequests(groupId, 'pending'),
    enabled: canManage,
  });

  const resolveRequestMutation = useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: 'approved' | 'rejected' }) =>
      resolveJoinRequest(groupId, userId, action),
    onSuccess: () => {
      void joinRequestsQuery.refetch();
      void membersQuery.refetch();
    },
  });

  if (groupQuery.isPending || membersQuery.isPending || plansQuery.isPending) {
    return <DetailSkeleton />;
  }

  if (groupQuery.isError) {
    // 403 → redirect to groups list
    const err = groupQuery.error as { status?: number } | null;
    if (err?.status === 403) {
      void navigate({ to: '/planner/groups' });
      toast.error("You don't have access to this group anymore.");
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
    if (action === 'delete') {
      setDeleteError(null);
      setDeleteOpen(true);
      return;
    }
    // Archive
    if (group.external_source === 'm365') {
      setArchiveM365Open(true);
      return;
    }
    doArchive();
  }

  function doArchive() {
    deleteGroup.mutate(
      { expected_version: group.version },
      {
        onSuccess: () => {
          toast('Group archived. You can restore it from the Archived filter.');
          void navigate({ to: '/planner/groups' });
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't archive the group."),
      },
    );
  }

  function doDelete() {
    setDeleteError(null);
    deleteGroup.mutate(
      { expected_version: group.version },
      {
        onSuccess: () => {
          setDeleteOpen(false);
          toast('Group archived. You can restore it from the Archived filter.');
          void navigate({ to: '/planner/groups' });
        },
        onError: (e) => {
          setDeleteError(e instanceof Error ? e.message : "Couldn't delete the group.");
        },
      },
    );
  }

  function doRestore() {
    restoreGroup.mutate(
      { group_id: groupId },
      {
        onSuccess: () => toast('Group restored'),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't restore the group."),
      },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <GroupDetailHeader
        group={group}
        canManage={canManage}
        onEditClick={() => setEditOpen(true)}
        onInviteClick={() => setAddMembersOpen(true)}
        onCreatePlanClick={() => setCreatePlanOpen(true)}
        onMenuAction={handleMenuAction}
      />
      {group.deleted_at && (
        <div className="flex flex-none items-center justify-between gap-4 border-b border-hairline bg-semantic-warning-tint px-6 py-2 text-body-sm text-semantic-warning">
          <span>This group is archived.</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={doRestore}
            disabled={restoreGroup.isPending}
          >
            Restore
          </Button>
        </div>
      )}
      <Tabs
        value={tab}
        onValueChange={(t) => onTabChange(t as GroupTab)}
        className="flex flex-1 min-h-0 flex-col"
      >
        <TabsList className="flex border-b border-hairline px-6 justify-start gap-1 bg-canvas rounded-none">
          <TabsTrigger
            value="plans"
            className="group gap-2 data-[state=active]:[&>span]:bg-primary-tint data-[state=active]:[&>span]:text-primary-ink"
          >
            Plans
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-surface-2 px-1.5 text-[11px] font-medium text-ink-muted transition-colors">
              {plans.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="members"
            className="group gap-2 data-[state=active]:[&>span]:bg-primary-tint data-[state=active]:[&>span]:text-primary-ink"
          >
            Members
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-surface-2 px-1.5 text-[11px] font-medium text-ink-muted transition-colors">
              {memberTotal}
            </span>
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          {canManage ? <TabsTrigger value="settings">Settings</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="plans" className="flex-1 overflow-auto bg-surface-1">
          <div className="page-container grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
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
              totalMemberCount={memberTotal}
              canManage={canManage}
              onAddMember={() => setAddMembersOpen(true)}
              onSeeAllMembers={() => onTabChange('members')}
              activityItems={
                activityQuery.isPending ? undefined : (activityQuery.data?.items ?? null)
              }
              pendingRequests={canManage ? (joinRequestsQuery.data ?? []) : undefined}
              onApproveRequest={(userId) =>
                resolveRequestMutation.mutate({ userId, action: 'approved' })
              }
              onRejectRequest={(userId) =>
                resolveRequestMutation.mutate({ userId, action: 'rejected' })
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="members" className="flex-1 overflow-auto bg-surface-1">
          <div className="page-container grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
            <GroupMembersTable
              group={group}
              members={members}
              canManageRoles={canManageRoles}
              canRemoveMembers={canManage}
              onRoleChange={(v) => setMemberRoleMutation.mutate(v)}
              onRemoveMember={(member) => setMemberToRemove(member)}
              onRemoveMembers={(userIds) => setMembersToRemove(userIds)}
            />
            <GroupRail
              group={group}
              members={members}
              totalMemberCount={memberTotal}
              canManage={canManage}
              onAddMember={() => setAddMembersOpen(true)}
              activityItems={
                activityQuery.isPending ? undefined : (activityQuery.data?.items ?? null)
              }
              pendingRequests={canManage ? (joinRequestsQuery.data ?? []) : undefined}
              onApproveRequest={(userId) =>
                resolveRequestMutation.mutate({ userId, action: 'approved' })
              }
              onRejectRequest={(userId) =>
                resolveRequestMutation.mutate({ userId, action: 'rejected' })
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="activity" className="flex-1 overflow-auto bg-surface-1">
          <div className="page-container">
            <ActivityFeedTab groupId={groupId} />
          </div>
        </TabsContent>
        <TabsContent value="integrations">
          <ComingSoon feature="Integrations" />
        </TabsContent>

        {canManage ? (
          <TabsContent value="settings" className="p-6">
            <div className="text-sm text-ink-subtle">Group settings are coming soon.</div>
          </TabsContent>
        ) : null}
      </Tabs>

      <CreatePlanDialog groupId={groupId} open={createPlanOpen} onOpenChange={setCreatePlanOpen} />
      <EditGroupDialog group={group} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteGroupDialog
        group={group}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={doDelete}
        isPending={deleteGroup.isPending}
        error={deleteError}
      />
      <Dialog open={archiveM365Open} onOpenChange={setArchiveM365Open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive M365-linked group?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-body-sm text-ink-subtle">
              This group is linked to Microsoft 365. Archiving pauses sync here, but the group
              remains in Microsoft 365.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setArchiveM365Open(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setArchiveM365Open(false);
                  doArchive();
                }}
              >
                Archive anyway
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={restorePromptOpen} onOpenChange={setRestorePromptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This group is archived</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-body-sm text-ink-subtle">
              This group has been archived. Would you like to restore it so it becomes active again?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRestorePromptOpen(false)}>
                View anyway
              </Button>
              <Button
                onClick={() => {
                  setRestorePromptOpen(false);
                  doRestore();
                }}
                disabled={restoreGroup.isPending}
              >
                Restore group
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AddGroupMembersDialog
        groupId={groupId}
        existingMembers={members}
        open={addMembersOpen}
        onOpenChange={setAddMembersOpen}
      />
      <ConfirmRemoveMemberDialog
        open={memberToRemove !== null}
        onOpenChange={(v) => {
          if (!v) setMemberToRemove(null);
        }}
        memberName={memberToRemove?.display_name ?? ''}
        isPending={removeGroupMemberMutation.isPending}
        onConfirm={() => {
          if (!memberToRemove) return;
          removeGroupMemberMutation.mutate(
            { user_id: memberToRemove.user_id },
            { onSuccess: () => setMemberToRemove(null) },
          );
        }}
      />
      <ConfirmRemoveMembersDialog
        open={membersToRemove !== null}
        onOpenChange={(v) => {
          if (!v) setMembersToRemove(null);
        }}
        count={membersToRemove?.length ?? 0}
        isPending={removeGroupMembersMutation.isPending}
        onConfirm={() => {
          if (!membersToRemove) return;
          removeGroupMembersMutation.mutate(membersToRemove, {
            onSuccess: () => setMembersToRemove(null),
          });
        }}
      />
    </div>
  );
}
