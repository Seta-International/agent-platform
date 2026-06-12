import type { GroupActivityItem, GroupMemberRow, GroupRow } from '@seta/planner';
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  cn,
  formatRelative,
} from '@seta/shared-ui';
import { Check, ChevronRight, Plus, Shield, Users, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { GroupJoinRequestRow } from '../api/planner-client';
import { buildActivityLabel } from '../lib/build-activity-label';
import { absoluteActivityTime } from '../lib/format-activity-time';

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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
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
          <Avatar className="size-6 shrink-0">
            <AvatarFallback className="text-[10px] font-semibold">
              {item.actor_display_name ? itemInitials(item.actor_display_name) : '?'}
            </AvatarFallback>
          </Avatar>
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

function itemInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
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
      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-eyebrow uppercase tracking-wide text-ink-subtle">
              Members{' '}
              <span className="ml-1 text-xs normal-case text-ink-subtle">{memberCount}</span>
            </h3>
            {canManage ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={onAddMember}
                aria-label="Add member"
                className="h-6 px-1.5"
              >
                <Plus className="size-3" /> Add
              </Button>
            ) : null}
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
                <Avatar className="size-7 shrink-0">
                  <AvatarFallback className="text-[10px] font-semibold">
                    {initials(m.display_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.display_name}</div>
                  {m.email ? (
                    <div className="truncate text-xs text-ink-subtle">{m.email}</div>
                  ) : null}
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
              className="mt-1 h-6 px-1.5 text-ink-subtle"
              onClick={onSeeAllMembers}
            >
              See all {memberCount} members <ChevronRight className="size-3" />
            </Button>
          ) : null}
          {canManage && pendingRequests && pendingRequests.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <p className="text-xs font-semibold text-ink-muted mb-2">Pending requests</p>
              <ul className="flex flex-col gap-2">
                {pendingRequests.map((req) => (
                  <li key={req.user_id} className="flex items-center gap-2 text-sm">
                    <Avatar className="size-6 shrink-0">
                      <AvatarFallback className="text-[10px] font-semibold">
                        {initials(req.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{req.display_name}</p>
                      <p className="truncate text-xs text-ink-subtle">{req.email}</p>
                      <p className="text-xs text-ink-subtle">{shortDate(req.requested_at)}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        onClick={() => onApproveRequest?.(req.user_id)}
                        title="Approve"
                      >
                        <Check className="size-3 text-green-600" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        onClick={() => onRejectRequest?.(req.user_id)}
                        title="Reject"
                      >
                        <X className="size-3 text-red-500" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {canManage && pendingRequests && pendingRequests.length === 0 && (
            <p className="mt-2 text-xs text-ink-subtle">No pending requests.</p>
          )}
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-2 text-eyebrow uppercase tracking-wide text-ink-subtle">
            Recent activity
          </h3>
          <ActivityList items={activityItems} />
        </CardContent>
      </Card>

      {/* Properties */}
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-2 text-eyebrow uppercase tracking-wide text-ink-subtle">Properties</h3>
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
        </CardContent>
      </Card>
    </aside>
  );
}
