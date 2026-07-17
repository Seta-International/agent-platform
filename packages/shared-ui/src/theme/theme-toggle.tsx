import { Monitor, Moon, Sun } from 'lucide-react';
import { DropdownMenu, DropdownMenuItem } from '../primitives/dropdown-menu';
import { useTheme } from './theme-provider';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <DropdownMenu
      placement="below"
      button={{
        variant: 'ghost',
        size: 'sm',
        isIconOnly: true,
        label: 'Toggle theme',
        icon: resolvedTheme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />,
      }}
    >
      <DropdownMenuItem
        icon={<Sun className="size-4" />}
        label="Light"
        onClick={() => setTheme('light')}
      />
      <DropdownMenuItem
        icon={<Moon className="size-4" />}
        label="Dark"
        onClick={() => setTheme('dark')}
      />
      <DropdownMenuItem
        icon={<Monitor className="size-4" />}
        label="System"
        onClick={() => setTheme('system')}
      />
    </DropdownMenu>
  );
}
