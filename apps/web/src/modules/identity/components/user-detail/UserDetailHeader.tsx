import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  formatRelative,
} from '@seta/shared-ui';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type AdminUserDetail, deactivateAdminUser } from '../../api/client.ts';
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
  const router = useRouter();
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

  async function toggleActivation() {
    await deactivateAdminUser(userId, isDeactivated ? 'reactivate' : 'deactivate');
    onChange();
  }

  return (
    <div className="border-b border-hairline px-7 py-4 bg-canvas">
      <div className="text-xs text-ink-muted mb-3 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5"
          onClick={() => router.history.back()}
        >
          <ChevronLeft className="h-3 w-3 mr-1" />
          Back to Users
        </Button>
        <span className="opacity-60">·</span>
        <span>
          Admin <ChevronRight className="inline h-3 w-3" /> Users
        </span>
      </div>
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16 text-xl">
          <AvatarFallback>{initials(detail.profile.display_name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-[22px] font-semibold tracking-tight">
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
          <div className="flex items-center gap-3 text-sm text-ink-muted flex-wrap">
            <span className="font-mono">{detail.profile.email}</span>
            <span className="opacity-60">·</span>
            <span>Joined {formatRelative(detail.profile.updated_at)}</span>
            <span className="opacity-60">·</span>
            <span>{detail.profile.timezone}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={() => setResetOpen(true)}>
            Reset password
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
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
            title={prev ? 'Previous user (K)' : 'Open the user list to enable J/K nav'}
          >
            <ChevronLeft className="h-3 w-3" />K
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!next}
            onClick={() =>
              next && navigate({ to: '/admin/users/$userId', params: { userId: next } })
            }
            title={next ? 'Next user (J)' : 'Open the user list to enable J/K nav'}
          >
            J
            <ChevronRight className="h-3 w-3" />
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
