import type { GroupWithCountsRow } from '@seta/planner';
import { Badge, Button, GroupTile } from '@seta/shared-ui';
import { Link } from '@tanstack/react-router';
import { Shield, Users } from 'lucide-react';

interface Props {
  groups: ReadonlyArray<GroupWithCountsRow>;
  onRestore?: (groupId: string) => void;
}

export function GroupsGrid({ groups, onRestore }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
      {groups.map((g) => (
        <Link
          key={g.id}
          to="/planner/groups/$groupId"
          params={{ groupId: g.id }}
          aria-label={g.name}
          className="rounded-lg border border-hairline bg-canvas p-4 hover:border-hairline-strong hover:shadow-sm transition block"
        >
          {/* Top row: tile on left, archived badge slot on right */}
          <div className="flex items-start justify-between">
            <GroupTile size={36} name={g.name} theme={g.theme} />
            {g.deleted_at ? <Badge variant="secondary">Archived</Badge> : <div />}
          </div>

          {/* Name */}
          <p className="mt-3 text-base font-semibold text-ink">{g.name}</p>

          {/* Description — always rendered for height consistency */}
          <p className="mt-1 line-clamp-2 text-sm text-ink-subtle">
            {g.description ?? <span className="text-ink-tertiary italic">No description</span>}
          </p>

          {/* Metadata row */}
          <p className="mt-2 text-xs text-ink-subtle">
            {g.plan_count} plans · {g.member_count} members
          </p>

          {/* Visibility pill */}
          <div className="mt-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-1 px-2 py-0.5 text-xs">
              {g.visibility === 'private' ? (
                <>
                  <Shield className="size-3 shrink-0" aria-hidden="true" />
                  <span>Private</span>
                </>
              ) : (
                <>
                  <Users className="size-3 shrink-0" aria-hidden="true" />
                  <span>Workspace</span>
                </>
              )}
            </span>
          </div>
          {onRestore && g.deleted_at && (
            <div className="mt-3">
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRestore(g.id);
                }}
              >
                Restore
              </Button>
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
