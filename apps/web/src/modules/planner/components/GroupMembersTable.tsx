import type { GroupMemberRow, GroupRow } from '@seta/planner';
import {
  Avatar,
  AvatarFallback,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@seta/shared-ui';

interface Props {
  group: GroupRow; // for external_source check
  members: ReadonlyArray<GroupMemberRow>;
  canManageRoles: boolean; // tenant.admin | org.admin | planner.admin | group owner
  onRoleChange: (input: { user_id: string; role: 'owner' | 'member' }) => void;
  // Removing members is out of scope for PR2 — handled in a future enhancement
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

interface RoleControlProps {
  member: GroupMemberRow;
  canEdit: boolean;
  isLinkedGroup: boolean;
  onChange: (role: 'owner' | 'member') => void;
}

function RoleControl({ member, canEdit, isLinkedGroup, onChange }: RoleControlProps) {
  if (canEdit) {
    return (
      <select
        value={member.role}
        aria-label={`Change role for ${member.display_name}`}
        className="h-7 w-28 rounded border border-hairline bg-canvas px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        onChange={(e) => onChange(e.target.value as 'owner' | 'member')}
      >
        <option value="owner">Owner</option>
        <option value="member">Member</option>
      </select>
    );
  }

  // Read-only pill. For linked groups (M365), wrap in a tooltip explaining why.
  const pill = (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full px-2 text-xs',
        member.role === 'owner'
          ? 'bg-primary-tint text-primary-ink'
          : 'bg-surface-2 text-ink-muted',
      )}
    >
      {member.role === 'owner' ? 'Owner' : 'Member'}
    </span>
  );

  if (isLinkedGroup) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: tooltip needs keyboard access */}
            <span tabIndex={0}>{pill}</span>
          </TooltipTrigger>
          <TooltipContent>Managed in M365</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return pill;
}

export function GroupMembersTable({ group, members, canManageRoles, onRoleChange }: Props) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-canvas">
          <tr className="border-b border-hairline text-left text-eyebrow uppercase tracking-wide text-ink-subtle">
            <th className="px-4 py-2 font-medium">Member</th>
            <th className="px-4 py-2 font-medium">Email</th>
            <th className="px-4 py-2 font-medium">Role</th>
            <th className="px-4 py-2 font-medium">Added</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.user_id} className="border-b border-hairline-tertiary">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Avatar className="size-7 shrink-0">
                    <AvatarFallback>{initials(m.display_name)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{m.display_name}</span>
                </div>
              </td>
              <td className="px-4 py-2.5 text-ink-subtle">{m.email}</td>
              <td className="px-4 py-2.5">
                <RoleControl
                  member={m}
                  canEdit={canManageRoles && group.external_source === 'native'}
                  isLinkedGroup={group.external_source !== 'native'}
                  onChange={(role) => onRoleChange({ user_id: m.user_id, role })}
                />
              </td>
              <td className="px-4 py-2.5 text-ink-subtle">{shortDate(m.added_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
