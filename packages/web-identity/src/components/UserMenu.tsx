import { Avatar, DropdownMenu, DropdownMenuItem, useThemeOptional } from '@seta/shared-ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { authClient } from '../auth-client.ts';
import { useSession } from './SessionProvider.tsx';

const APPEARANCE = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const;

// Astryx's compound DropdownMenuItem has no divider sub-component (data-driven only)
// and no submenu/radio-group support — the appearance picker is flattened into the
// main list (with a heading + active check) rather than a nested submenu.
function MenuDivider() {
  return (
    <hr
      aria-hidden
      style={{
        height: 1,
        margin: '4px 6px',
        border: 'none',
        backgroundColor: 'var(--color-border)',
      }}
    />
  );
}

export function UserMenu({ onSignOut }: { onSignOut?: () => void } = {}) {
  const session = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const theme = useThemeOptional();
  return (
    <DropdownMenu
      placement="below"
      hasChevron={false}
      menuWidth={256}
      button={{
        label: 'Account menu',
        variant: 'ghost',
        className: 'rounded-full',
        children: <Avatar name={session.display_name || session.email} size={32} />,
      }}
    >
      <div className="px-2 py-1.5 text-sm">
        <div className="truncate font-medium" title={session.display_name}>
          {session.display_name}
        </div>
        <div className="truncate text-secondary text-xs font-mono" title={session.email}>
          {session.email}
        </div>
      </div>
      <MenuDivider />
      <DropdownMenuItem
        label="Settings"
        onClick={() => navigate({ to: '/settings/profile' as '/' })}
      />
      {theme && (
        <>
          <MenuDivider />
          <div className="px-2 py-1.5 text-sm uppercase tracking-wide text-secondary">
            Appearance
          </div>
          {APPEARANCE.map(({ value, label, Icon }) => (
            <DropdownMenuItem
              key={value}
              icon={<Icon className="size-3.5 text-secondary" aria-hidden />}
              label={label}
              endContent={
                theme.theme === value ? <Check className="size-3.5" aria-hidden /> : undefined
              }
              onClick={() => theme.setTheme(value)}
            />
          ))}
        </>
      )}
      <MenuDivider />
      <DropdownMenuItem
        label="Sign out"
        onClick={async () => {
          await authClient.signOut();
          queryClient.clear();
          onSignOut?.();
          void navigate({
            to: '/login',
            search: { redirect: undefined, reason: undefined, error: undefined },
          });
        }}
      />
    </DropdownMenu>
  );
}
