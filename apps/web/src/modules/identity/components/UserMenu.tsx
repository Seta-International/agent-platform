import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';
import { useSession } from './SessionProvider.tsx';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function hasAdminAccess(roles: string[]): boolean {
  return roles.includes('org.admin') || roles.includes('identity.admin');
}

export function UserMenu() {
  const session = useSession();
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Avatar>
          <AvatarFallback>{initials(session.display_name || session.email)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-sm">
          <div className="font-medium">{session.display_name}</div>
          <div className="text-muted-foreground text-xs">{session.email}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            // Route added in a later task; cast avoids premature route-tree types
            navigate({ to: '/profile' as '/' })
          }
        >
          Profile &amp; settings
        </DropdownMenuItem>
        {hasAdminAccess(session.role_summary.roles) && (
          <DropdownMenuItem
            onSelect={() =>
              // Route added in a later task; cast avoids premature route-tree types
              navigate({ to: '/admin/users' as '/' })
            }
          >
            Admin
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut();
            void navigate({ to: '/login', search: { redirect: undefined, reason: undefined } });
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
