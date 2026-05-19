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
      {searchSlot}
      {enableColumnVisibility && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" aria-label="Columns">
              <Settings2 className="mr-2 size-4" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllColumns()
              .filter((c) => c.getCanHide())
              .map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={c.getIsVisible()}
                  onCheckedChange={(v) => c.toggleVisibility(!!v)}
                >
                  {String(c.columnDef.header ?? c.id)}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
