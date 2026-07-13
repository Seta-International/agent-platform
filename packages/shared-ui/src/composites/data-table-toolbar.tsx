import type { Table } from '@tanstack/react-table';
import { Settings2 } from 'lucide-react';
import type * as React from 'react';
import { Button } from '../primitives/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu';

interface Props<TData> {
  table: Table<TData>;
  searchSlot?: React.ReactNode;
  enableColumnVisibility?: boolean;
}

export function DataTableToolbar<TData>({
  table,
  searchSlot,
  enableColumnVisibility,
}: Props<TData>) {
  return (
    <div className="flex items-center justify-between">
      {/* Always render a slot (even empty) so a lone Columns button still lands on the
       * right — `justify-between` pins a single flex child to the start, not the end. */}
      <div>{searchSlot}</div>
      {enableColumnVisibility && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              label="Columns"
              icon={<Settings2 className="size-3.5" />}
              className="h-7 gap-1.5 px-2 text-ink-muted"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table.getAllColumns().flatMap((c) =>
              c.getCanHide()
                ? [
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={c.getIsVisible()}
                      onCheckedChange={(v) => c.toggleVisibility(!!v)}
                    >
                      {String(c.columnDef.header ?? c.id)}
                    </DropdownMenuCheckboxItem>,
                  ]
                : [],
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
