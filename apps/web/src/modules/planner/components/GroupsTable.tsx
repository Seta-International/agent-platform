import type { GroupWithCountsRow } from '@seta/planner';
import { Avatar, AvatarFallback, AvatarStack, formatRelative, GroupTile } from '@seta/shared-ui';
import { Link } from '@tanstack/react-router';
import { ChevronRight, Shield, Users } from 'lucide-react';

interface Props {
  groups: ReadonlyArray<GroupWithCountsRow>;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function GroupsTable({ groups }: Props) {
  return (
    <div className="w-full overflow-x-auto">
      {/* Header row */}
      <div
        className="sticky top-0 z-10 grid items-center border-b border-border bg-surface-0 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted"
        style={{ gridTemplateColumns: '40px 1.6fr 1fr 90px 110px 130px 100px 32px' }}
      >
        <div />
        <div>Group</div>
        <div>Owner</div>
        <div className="text-right">Plans</div>
        <div>Members</div>
        <div>Visibility</div>
        <div className="text-right">Activity</div>
        <div />
      </div>

      {/* Body rows */}
      <div>
        {groups.map((group) => (
          <Link
            key={group.id}
            to="/planner/groups/$groupId"
            params={{ groupId: group.id }}
            className="grid items-center border-b border-border px-4 py-3 text-sm text-ink transition-colors hover:bg-surface-1"
            style={{ gridTemplateColumns: '40px 1.6fr 1fr 90px 110px 130px 100px 32px' }}
            aria-label={group.name}
          >
            {/* Tile */}
            <div className="flex items-center">
              <GroupTile size={28} theme={group.theme} name={group.name} />
            </div>

            {/* Name + description */}
            <div className="min-w-0 pr-4">
              <p className="truncate font-semibold text-ink">{group.name}</p>
              {group.description && (
                <p className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-ink-muted">
                  {group.description}
                </p>
              )}
            </div>

            {/* Owner */}
            <div className="flex min-w-0 items-center gap-2 pr-4">
              <Avatar className="h-6 w-6 shrink-0 text-[10px]">
                <AvatarFallback>
                  {group.owner_display_name ? initialsOf(group.owner_display_name) : '—'}
                </AvatarFallback>
              </Avatar>
              <span className="truncate text-xs text-ink-subtle">
                {group.owner_display_name ?? '—'}
              </span>
            </div>

            {/* Plans */}
            <div className="text-right font-mono text-sm tabular-nums">{group.plan_count}</div>

            {/* Members */}
            <div className="flex items-center gap-2">
              <AvatarStack assignees={[]} max={3} />
              <span className="text-xs text-ink-muted">{group.member_count}</span>
            </div>

            {/* Visibility */}
            <div className="flex items-center gap-1.5 text-xs text-ink-subtle">
              {group.visibility === 'private' ? (
                <>
                  <Shield className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>Private</span>
                </>
              ) : (
                <>
                  <Users className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>Public</span>
                </>
              )}
            </div>

            {/* Activity */}
            <div className="text-right text-xs text-ink-muted">
              {formatRelative(group.updated_at)}
            </div>

            {/* Chevron */}
            <div className="flex justify-end">
              <ChevronRight className="size-3 text-ink-tertiary" aria-hidden="true" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
