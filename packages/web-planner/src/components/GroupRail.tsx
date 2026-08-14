import type { GroupActivityItem, GroupMemberRow, GroupRow } from '@seta/planner';
import {
  Avatar,
  Badge,
  Button,
  Card,
  cn,
  DisabledActionTooltip,
  EmptyState,
  formatRelative,
  IconButton,
  Text,
} from '@seta/shared-ui';
import { Check, ChevronRight, Inbox, Plus, Shield, Users, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { GroupJoinRequestRow } from '../api/planner-client';
import { buildActivityLabel } from '../lib/build-activity-label';
import { absoluteActivityTime } from '../lib/format-activity-time';
import { LINKED_GROUP, PERMISSION_DENIED } from '../lib/permission-messages';

interface Props {
  group: GroupRow;
  members: ReadonlyArray<GroupMemberRow>;
  totalMemberCount?: number;
  canManage: boolean;
  onAddMember: () => void;
  onSeeAllMembers?: () => void;
  shownMemberCount?: number;
  /**
   * Render the member roster inside the Members card. Off on the Members tab, where the
   * full table already lists everyone — the rail then shows only the header + pending requests.
   */
  showMemberList?: boolean;
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
    return <p className="text-xs text-secondary">Loading activity…</p>;
  }
  if (items === null) {
    return <p className="text-xs text-secondary">Activity unavailable.</p>;
  }
  if (items.length === 0) {
    return <p className="text-xs text-secondary">No activity in the last 7 days.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.event_id} className="flex items-start gap-2 text-sm">
          <Avatar name={item.actor_display_name ?? undefined} size={24} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{buildActivityLabel(item)}</div>
            <div className="text-xs text-secondary" title={absoluteActivityTime(item.occurred_at)}>
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
      <span className="text-secondary">{label}</span>
      <span className="text-primary">{value}</span>
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
  showMemberList = true,
  activityItems,
  pendingRequests,
  onApproveRequest,
  onRejectRequest,
}: Props) {
  const memberCount = totalMemberCount ?? members.length;
  const visibleMembers = members.slice(0, shownMemberCount);
  const hasMore = memberCount > shownMemberCount;
  const isLinkedGroup = group.external_source !== 'native';
  const canAddMember = canManage && !isLinkedGroup;

  return (
    <aside className="flex flex-col gap-3 w-80">
      {/* Members card */}
      <Card padding={4}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Text as="h3" size="sm" weight="semibold">
              Members
            </Text>
            <Badge variant="neutral" label={memberCount} />
          </div>
          <DisabledActionTooltip
            disabled={!canAddMember}
            reason={isLinkedGroup ? LINKED_GROUP.members : PERMISSION_DENIED.group.addMember}
          >
            <IconButton
              size="sm"
              variant="ghost"
              onClick={onAddMember}
              label="Add member"
              icon={<Plus className="size-4" />}
              isDisabled={!canAddMember}
            />
          </DisabledActionTooltip>
        </div>
        {showMemberList && (
          <>
            <div className="flex flex-col">
              {visibleMembers.map((m, i, arr) => (
                <div
                  key={m.user_id}
                  className={cn(
                    'flex items-center gap-2 py-1.5',
                    i < arr.length - 1 && 'border-b border-border',
                  )}
                >
                  <Avatar name={m.display_name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.display_name}</div>
                    {m.email ? (
                      <div className="truncate text-xs text-secondary">{m.email}</div>
                    ) : null}
                  </div>
                  <Badge
                    variant={m.role === 'owner' ? 'info' : 'neutral'}
                    label={m.role === 'owner' ? 'Owner' : 'Member'}
                  />
                </div>
              ))}
            </div>
            {hasMore ? (
              <Button
                size="sm"
                variant="ghost"
                label={`See all ${memberCount} members`}
                endContent={<ChevronRight className="size-3.5" />}
                className="mt-1 text-secondary"
                onClick={onSeeAllMembers}
              />
            ) : null}
          </>
        )}
        {canManage && pendingRequests && pendingRequests.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="text-xs font-semibold text-secondary mb-2">Pending requests</p>
            <ul className="flex flex-col gap-2">
              {pendingRequests.map((req) => (
                <li key={req.user_id} className="flex items-center gap-2 text-sm">
                  <Avatar name={req.display_name} size={24} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{req.display_name}</p>
                    <p className="truncate text-xs text-secondary">{req.email}</p>
                    <p className="text-xs text-secondary">{shortDate(req.requested_at)}</p>
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
          <div className={showMemberList ? 'mt-3 border-t border-border pt-3' : undefined}>
            <EmptyState
              isCompact
              headingLevel={4}
              icon={<Inbox className="size-5 text-secondary" aria-hidden />}
              title="No pending requests"
              description="Join requests will appear here."
            />
          </div>
        )}
      </Card>

      {/* Recent activity */}
      <Card padding={4}>
        <Text as="h3" size="sm" weight="semibold" className="mb-2">
          Recent activity
        </Text>
        <ActivityList items={activityItems} />
      </Card>

      {/* Properties */}
      <Card padding={4}>
        <Text as="h3" size="sm" weight="semibold" className="mb-2">
          Properties
        </Text>
        <div className="flex flex-col">
          <PropertyRow
            label="Visibility"
            value={
              <span className="inline-flex items-center gap-1.5">
                {group.visibility === 'private' ? (
                  <Shield className="size-3 text-secondary" />
                ) : (
                  <Users className="size-3 text-secondary" />
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
              <Badge
                variant="neutral"
                label={group.default_role === 'owner' ? 'Owner' : 'Member'}
              />
            }
          />
          <PropertyRow label="Created" value={shortDate(group.created_at)} />
        </div>
      </Card>
    </aside>
  );
}
