import type { Table } from '@tanstack/react-table';
import { Settings2 } from 'lucide-react';
import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../primitives/button';

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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Column visibility is a persistent multi-toggle menu — it must stay open across
  // clicks. Astryx's DropdownMenuItem always closes the menu on click (no
  // checkbox-item equivalent), so this stays a bespoke popover until the D2 batch
  // rebuilds it on Astryx Popover + Checkbox.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="flex items-center justify-between">
      {/* Always render a slot (even empty) so a lone Columns button still lands on the
       * right — `justify-between` pins a single flex child to the start, not the end. */}
      <div>{searchSlot}</div>
      {enableColumnVisibility && (
        <div ref={containerRef} className="relative">
          <Button
            variant="ghost"
            size="sm"
            label="Columns"
            icon={<Settings2 className="size-3.5" />}
            className="h-7 gap-1.5 px-2 text-ink-muted"
            onClick={() => setOpen((v) => !v)}
          />
          {open && (
            <div
              role="menu"
              aria-label="Toggle columns"
              className="absolute right-0 z-50 mt-1 min-w-[180px] rounded-md border border-hairline bg-surface-3 p-1 text-ink shadow-lg"
            >
              <div className="px-2 py-1.5 text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">
                Toggle columns
              </div>
              <div className="-mx-1 my-1 h-px bg-hairline" />
              {table.getAllColumns().flatMap((c) =>
                c.getCanHide()
                  ? [
                      <label
                        key={c.id}
                        className="flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-body-sm text-ink hover:bg-surface-4"
                      >
                        <input
                          type="checkbox"
                          checked={c.getIsVisible()}
                          onChange={(e) => c.toggleVisibility(e.target.checked)}
                        />
                        {String(c.columnDef.header ?? c.id)}
                      </label>,
                    ]
                  : [],
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
