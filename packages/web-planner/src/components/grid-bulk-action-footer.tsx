import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@seta/shared-ui';
import { listTenantUsers } from '@seta/web-identity';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export interface BulkBucketOption {
  id: string;
  name: string;
}

interface Props {
  count: number;
  bucketOptions: ReadonlyArray<BulkBucketOption>;
  isLinkedToM365?: boolean;
  onMove: (toBucketId: string | null) => void;
  onAssign: (userId: string) => void;
  onSetDue: (due: string | null) => void;
  onDelete: () => void;
}

export function GridBulkActionFooter({
  count,
  bucketOptions,
  isLinkedToM365,
  onMove,
  onAssign,
  onSetDue,
  onDelete,
}: Props) {
  return (
    <footer
      role="toolbar"
      className="grid-bulk-action-footer"
      aria-label={`${count} tasks selected`}
    >
      <span>
        <strong>{count}</strong> selected
      </span>
      <BucketMenu options={bucketOptions} onPick={onMove} />
      <AssigneeMenu onPick={onAssign} isLinkedToM365={isLinkedToM365 ?? false} />
      <DueMenu onPick={onSetDue} />
      <button type="button" className="grid-bulk-action-footer__danger" onClick={onDelete}>
        Delete
      </button>
    </footer>
  );
}

function BucketMenu({
  options,
  onPick,
}: {
  options: ReadonlyArray<BulkBucketOption>;
  onPick: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button">Move</button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        <button
          type="button"
          className="flex w-full items-center rounded px-2 py-1.5 text-sm hover:bg-surface-2"
          onClick={() => {
            onPick(null);
            setOpen(false);
          }}
        >
          No bucket
        </button>
        {options.map((b) => (
          <button
            key={b.id}
            type="button"
            className="flex w-full items-center rounded px-2 py-1.5 text-sm hover:bg-surface-2"
            onClick={() => {
              onPick(b.id);
              setOpen(false);
            }}
          >
            {b.name}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function AssigneeMenu({
  onPick,
  isLinkedToM365,
}: {
  onPick: (userId: string) => void;
  isLinkedToM365: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const userQuery = useQuery({
    queryKey: [
      'identity',
      'admin-users',
      { search: debounced, sign_in_method: isLinkedToM365 ? 'microsoft' : null },
    ],
    queryFn: () =>
      listTenantUsers({
        search: debounced,
        limit: 8,
        offset: 0,
        ...(isLinkedToM365 ? { sign_in_method: 'microsoft' as const } : {}),
      }),
    enabled: open,
  });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <button type="button">Assign</button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            aria-label="Search users"
            placeholder="Search users"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {userQuery.isPending && search ? 'Searching…' : 'No users found.'}
            </CommandEmpty>
            <CommandGroup>
              {(userQuery.data?.rows ?? []).map((u) => (
                <CommandItem
                  key={u.user_id}
                  value={u.user_id}
                  onSelect={() => {
                    onPick(u.user_id);
                    setOpen(false);
                    setSearch('');
                  }}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="truncate text-body-sm leading-tight text-ink">{u.name}</span>
                  <span className="truncate text-caption leading-tight text-ink-subtle">
                    {u.email}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DueMenu({ onPick }: { onPick: (due: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button">Set due</button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-subtle">Due date</span>
          <input
            suppressHydrationWarning
            type="date"
            aria-label="Bulk due date"
            onChange={(e) => {
              const v = e.target.value;
              onPick(v ? new Date(v).toISOString() : null);
              setOpen(false);
            }}
          />
        </label>
        <button
          type="button"
          className="mt-2 w-full rounded px-2 py-1.5 text-left text-sm text-ink-subtle hover:bg-surface-2"
          onClick={() => {
            onPick(null);
            setOpen(false);
          }}
        >
          Clear due date
        </button>
      </PopoverContent>
    </Popover>
  );
}
