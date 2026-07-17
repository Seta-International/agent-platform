import type { GroupActivityItem, GroupMemberRow, GroupRow } from '@seta/planner';
import {
  Avatar,
  Button,
  Card,
  cn,
  DisabledActionTooltip,
  formatRelative,
  Heading,
} from '@seta/shared-ui';
import { Check, ChevronRight, Plus, Shield, Users, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { GroupJoinRequestRow } from '../api/planner-client';
import { buildActivityLabel } from '../lib/build-activity-label';
import { absoluteActivityTime } from '../lib/format-activity-time';
import { PERMISSION_DENIED } from '../lib/permission-messages';

interface Props {
  group: GroupRow;
  members: ReadonlyArray<GroupMemberRow>;
  totalMemberCount?: number;
  canManage: boolean;
  onAddMember: () => void;
  onSeeAllMembers?: () => void;
  shownMemberCount?: number;
  /** Recent items from getGroupActivity; `null` while loading. */
  activityItems?: ReadonlyArray<GroupActivityItem> | null;
  pendingRequests?: ReadonlyArray<GroupJoinRequestRow>;
  onApproveRequest?: (userId: string) => void;
  onRejectRequest?: (userId: string) => void;
}

const shortDateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function shortDate(iso: string): string {
  return shortDateFmt.format(new Date(iso));
}

interface PropertyRowProps {
  label: string;
  value: ReactNode;
}

function ActivityList({ items }: { items: ReadonlyArray<GroupActivityItem> | null | undefined }) {
  if (items === undefined) {
    return <p className="text-xs text-ink-subtle">Loading activity…</p>;
  }
  if (items === null) {
    return <p className="text-xs text-ink-subtle">Activity unavailable.</p>;
  }
  if (items.length === 0) {
    return <p className="text-xs text-ink-subtle">No activity in the last 7 days.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.event_id} className="flex items-start gap-2 text-sm">
          <Avatar name={item.actor_display_name ?? undefined} size={24} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{buildActivityLabel(item)}</div>
            <div className="text-xs text-ink-subtle" title={absoluteActivityTime(item.occurred_at)}>
              {formatRelative(item.occurred_at)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PropertyRow({ label, value }: PropertyRowProps) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}

export function GroupRail({
  group,
  members,
  totalMemberCount,
  canManage,
  onAddMember,
  onSeeAllMembers,
  shownMemberCount = 7,
  activityItems,
  pendingRequests,
  onApproveRequest,
  onRejectRequest,
}: Props) {
  const memberCount = totalMemberCount ?? members.length;
  const visibleMembers = members.slice(0, shownMemberCount);
  const hasMore = memberCount > shownMemberCount;

  return (
    <aside className="flex flex-col gap-3 w-80">
      {/* Members card */}
      <Card padding={4}>
        <div className="mb-2 flex items-baseline justify-between">
          <Heading level={3}>
            Members <span className="ml-1 text-xs normal-case text-ink-subtle">{memberCount}</span>
          </Heading>
          <DisabledActionTooltip disabled={!canManage} reason={PERMISSION_DENIED.group.addMember}>
            <Button
              size="sm"
              variant="ghost"
              onClick={onAddMember}
              label="Add member"
              icon={<Plus className="size-3" />}
              className="h-6 px-1.5"
              isDisabled={!canManage}
            >
              Add
            </Button>
          </DisabledActionTooltip>
        </div>
        <div className="flex flex-col">
          {visibleMembers.map((m, i, arr) => (
            <div
              key={m.user_id}
              className={cn(
                'flex items-center gap-2 py-1.5',
                i < arr.length - 1 && 'border-b border-hairline-tertiary',
              )}
            >
              <Avatar name={m.display_name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.display_name}</div>
                {m.email ? <div className="truncate text-xs text-ink-subtle">{m.email}</div> : null}
              </div>
              <span
                className={cn(
                  'inline-flex h-5 items-center rounded-full px-2 text-xs',
                  m.role === 'owner'
                    ? 'bg-primary-tint text-primary-ink'
                    : 'bg-surface-2 text-ink-muted',
                )}
              >
                {m.role === 'owner' ? 'Owner' : 'Member'}
              </span>
            </div>
          ))}
        </div>
        {hasMore ? (
          <Button
            size="sm"
            variant="ghost"
            label={`See all ${memberCount} members`}
            endContent={<ChevronRight className="size-3" />}
            className="mt-1 h-6 px-1.5 text-ink-subtle"
            onClick={onSeeAllMembers}
          />
        ) : null}
        {canManage && pendingRequests && pendingRequests.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="text-xs font-semibold text-ink-muted mb-2">Pending requests</p>
            <ul className="flex flex-col gap-2">
              {pendingRequests.map((req) => (
                <li key={req.user_id} className="flex items-center gap-2 text-sm">
                  <Avatar name={req.display_name} size={24} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{req.display_name}</p>
                    <p className="truncate text-xs text-ink-subtle">{req.email}</p>
                    <p className="text-xs text-ink-subtle">{shortDate(req.requested_at)}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      isIconOnly
                      icon={<Check className="size-3 text-green-600" />}
                      label="Approve"
                      className="size-6"
                      onClick={() => onApproveRequest?.(req.user_id)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      isIconOnly
                      icon={<X className="size-3 text-red-500" />}
                      label="Reject"
                      className="size-6"
                      onClick={() => onRejectRequest?.(req.user_id)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {canManage && pendingRequests && pendingRequests.length === 0 && (
          <p className="mt-2 text-xs text-ink-subtle">No pending requests.</p>
        )}
      </Card>

      {/* Recent activity */}
      <Card padding={4}>
        <Heading level={3}>Recent activity</Heading>
        <ActivityList items={activityItems} />
      </Card>

      {/* Properties */}
      <Card padding={4}>
        <Heading level={3}>Properties</Heading>
        <div className="flex flex-col">
          <PropertyRow
            label="Visibility"
            value={
              <span className="inline-flex items-center gap-1.5">
                {group.visibility === 'private' ? (
                  <Shield className="size-3 text-ink-muted" />
                ) : (
                  <Users className="size-3 text-ink-muted" />
                )}
                {group.visibility === 'private' ? 'Private' : 'Workspace'}
              </span>
            }
          />
          <PropertyRow
            label="Source"
            value={
              group.external_source === 'native'
                ? 'Native'
                : `M365${group.external_id ? ` · ${group.external_id}` : ''}`
            }
          />
          <PropertyRow
            label="Default role"
            value={
              <span className="inline-flex h-5 items-center rounded-full bg-surface-2 px-2 text-xs">
                {group.default_role === 'owner' ? 'Owner' : 'Member'}
              </span>
            }
          />
          <PropertyRow label="Created" value={shortDate(group.created_at)} />
        </div>
      </Card>
    </aside>
  );
}
