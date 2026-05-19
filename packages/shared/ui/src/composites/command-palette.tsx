import * as React from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../primitives/command';

export interface PaletteCommand {
  id: string;
  label: string;
  group?: string;
  onRun: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: PaletteCommand[];
  placeholder?: string;
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
  placeholder = 'Type a command…',
}: CommandPaletteProps) {
  const groups = React.useMemo(() => {
    const out = new Map<string, PaletteCommand[]>();
    for (const c of commands) {
      const key = c.group ?? 'Commands';
      const list = out.get(key) ?? [];
      list.push(c);
      out.set(key, list);
    }
    return out;
  }, [commands]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={placeholder} />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        {[...groups.entries()].map(([group, items]) => (
          <CommandGroup key={group} heading={group}>
            {items.map((c) => (
              <CommandItem
                key={c.id}
                onSelect={() => {
                  c.onRun();
                  onOpenChange(false);
                }}
              >
                {c.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
