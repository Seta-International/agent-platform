import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  useThemeOptional,
} from '@seta/shared-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Monitor, Moon, Sun } from 'lucide-react';
import { authClient } from '../auth-client.ts';
import { useSession } from './SessionProvider.tsx';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

const APPEARANCE = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const;

export function UserMenu({ onSignOut }: { onSignOut?: () => void } = {}) {
  const session = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const theme = useThemeOptional();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas">
        <Avatar className="size-7">
          <AvatarFallback className="text-[11px] font-semibold">
            {initials(session.display_name || session.email)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-1.5 text-sm">
          <div className="truncate font-medium" title={session.display_name}>
            {session.display_name}
          </div>
          <div className="truncate text-muted-foreground text-xs font-mono" title={session.email}>
            {session.email}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate({ to: '/settings/profile' as '/' })}>
          Settings
        </DropdownMenuItem>
        {theme && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Appearance</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={theme.theme}
                onValueChange={(v) => theme.setTheme(v as 'light' | 'dark' | 'system')}
              >
                {APPEARANCE.map(({ value, label, Icon }) => (
                  <DropdownMenuRadioItem key={value} value={value}>
                    <Icon className="mr-2 size-3.5 text-ink-muted" aria-hidden />
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut();
            queryClient.clear();
            onSignOut?.();
            void navigate({ to: '/login', search: { redirect: undefined, reason: undefined } });
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
