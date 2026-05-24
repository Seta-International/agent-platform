import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@seta/shared-ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type AdminUserDetail, deactivateAdminUser } from '../../api/users-client.ts';
import { getNeighbors, useUserListOrder } from '../../state/user-list-order.ts';
import { StatusPill } from '../user-list/StatusPill.tsx';
import { ResetPasswordDialog } from './ResetPasswordDialog.tsx';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

export function UserDetailHeader({
  detail,
  userId,
  onChange,
}: {
  detail: AdminUserDetail;
  userId: string;
  onChange: () => void;
}) {
  const navigate = useNavigate();
  useUserListOrder();
  const { prev, next } = getNeighbors(userId);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      if ((e.key === 'j' || e.key === 'ArrowDown') && next) {
        e.preventDefault();
        void navigate({ to: '/admin/users/$userId', params: { userId: next } });
      }
      if ((e.key === 'k' || e.key === 'ArrowUp') && prev) {
        e.preventDefault();
        void navigate({ to: '/admin/users/$userId', params: { userId: prev } });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, next, prev]);

  const isDeactivated = detail.profile.deactivated_at != null;
  const wh = detail.profile.working_hours;

  async function toggleActivation() {
    await deactivateAdminUser(userId, isDeactivated ? 'reactivate' : 'deactivate');
    onChange();
  }

  return (
    <div className="px-7 pt-4 pb-3 bg-canvas">
      <div className="flex items-center gap-2 mb-3 text-xs text-ink-subtle">
        <Link
          to="/admin/users"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
        >
          <ChevronLeft className="size-3" />
          Back to Users
        </Link>
        <span>·</span>
        <span className="inline-flex items-center gap-1">
          <span>Admin</span>
          <ChevronRight className="size-3 opacity-60" />
          <Link to="/admin/users" className="text-primary hover:underline">
            Users
          </Link>
        </span>
      </div>

      <div className="flex items-center gap-4">
        <Avatar className="size-16 flex-none">
          <AvatarFallback className="text-base font-semibold">
            {initials(detail.profile.display_name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-[22px] font-semibold tracking-tight truncate">
              {detail.profile.display_name}
            </h1>
            <StatusPill
              status={
                isDeactivated
                  ? 'deactivated'
                  : detail.profile.availability_status === 'ooo'
                    ? 'ooo'
                    : 'active'
              }
            />
            {detail.grants.some((g) => g.role_slug === 'org.admin') && (
              <Badge className="h-[18px] px-1.5 text-[11px]">org.admin</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-ink-subtle flex-wrap">
            <span className="font-mono">{detail.profile.email}</span>
            <span>·</span>
            <span>{detail.profile.timezone}</span>
            {wh && (
              <>
                <span>·</span>
                <span>
                  Mon–Fri {wh.start}–{wh.end}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-none">
          <Button size="sm" onClick={() => setResetOpen(true)}>
            Reset password
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void toggleActivation()}>
                {isDeactivated ? 'Reactivate user' : 'Deactivate user'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(userId)}>
                Copy user ID
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="w-px h-4 bg-hairline mx-1" />
          <Button
            variant="ghost"
            size="sm"
            disabled={!prev}
            onClick={() =>
              prev && navigate({ to: '/admin/users/$userId', params: { userId: prev } })
            }
            title={prev ? 'Previous user (K)' : 'Open the user list to enable arrow-key navigation'}
          >
            <ChevronLeft className="size-3" />K
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!next}
            onClick={() =>
              next && navigate({ to: '/admin/users/$userId', params: { userId: next } })
            }
            title={next ? 'Next user (J)' : 'Open the user list to enable arrow-key navigation'}
          >
            J
            <ChevronRight className="size-3" />
          </Button>
        </div>
      </div>

      <ResetPasswordDialog
        open={resetOpen}
        userId={userId}
        email={detail.profile.email}
        onOpenChange={setResetOpen}
      />
    </div>
  );
}
