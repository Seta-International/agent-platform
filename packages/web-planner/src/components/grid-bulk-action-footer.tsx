import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  DateInput,
  DisabledActionTooltip,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@seta/shared-ui';
import { useState } from 'react';
import { useGroupMemberAssigneeSearch } from '../hooks/use-group-member-assignee-search';
import { PERMISSION_DENIED } from '../lib/permission-messages';

export interface BulkBucketOption {
  id: string;
  name: string;
}

interface Props {
  count: number;
  groupId: string;
  bucketOptions: ReadonlyArray<BulkBucketOption>;
  isLinkedToM365?: boolean;
  canMove?: boolean;
  canAssign?: boolean;
  canSetDue?: boolean;
  canDelete?: boolean;
  onMove: (toBucketId: string | null) => void;
  onAssign: (userId: string) => void;
  onSetDue: (due: string | null) => void;
  onDelete: () => void;
}

export function GridBulkActionFooter({
  count,
  groupId,
  bucketOptions,
  isLinkedToM365: _isLinkedToM365,
  canMove = true,
  canAssign = true,
  canSetDue = true,
  canDelete = true,
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
      <BucketMenu options={bucketOptions} onPick={onMove} disabled={!canMove} />
      <AssigneeMenu groupId={groupId} onPick={onAssign} disabled={!canAssign} />
      <DueMenu onPick={onSetDue} disabled={!canSetDue} />
      <DisabledActionTooltip disabled={!canDelete} reason={PERMISSION_DENIED.task.delete}>
        <button
          type="button"
          className="grid-bulk-action-footer__danger"
          disabled={!canDelete}
          onClick={onDelete}
        >
          Delete
        </button>
      </DisabledActionTooltip>
    </footer>
  );
}

function BucketMenu({
  options,
  onPick,
  disabled,
}: {
  options: ReadonlyArray<BulkBucketOption>;
  onPick: (id: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (disabled) {
    return (
      <DisabledActionTooltip disabled reason={PERMISSION_DENIED.task.move}>
        <button type="button" disabled>
          Move
        </button>
      </DisabledActionTooltip>
    );
  }
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

function AssigneeMenu({
  groupId,
  onPick,
  disabled,
}: {
  groupId: string;
  onPick: (userId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const memberQuery = useGroupMemberAssigneeSearch(groupId, search, open);

  if (disabled) {
    return (
      <DisabledActionTooltip disabled reason={PERMISSION_DENIED.task.assign}>
        <button type="button" disabled>
          Assign
        </button>
      </DisabledActionTooltip>
    );
  }
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
            aria-label="Search group members"
            placeholder="Search group members"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {memberQuery.isPending && search ? 'Searching…' : 'No group members found.'}
            </CommandEmpty>
            <CommandGroup>
              {memberQuery.members.map((m) => (
                <CommandItem
                  key={m.user_id}
                  value={m.user_id}
                  onSelect={() => {
                    onPick(m.user_id);
                    setOpen(false);
                    setSearch('');
                  }}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="truncate text-body-sm leading-tight text-ink">
                    {m.display_name}
                  </span>
                  <span className="truncate text-caption leading-tight text-ink-subtle">
                    {m.email}
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

function DueMenu({
  onPick,
  disabled,
}: {
  onPick: (due: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (disabled) {
    return (
      <DisabledActionTooltip disabled reason={PERMISSION_DENIED.task.edit}>
        <button type="button" disabled>
          Set due
        </button>
      </DisabledActionTooltip>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button">Set due</button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <DateInput
          label="Due date"
          onChange={(v) => {
            onPick(v ? new Date(v).toISOString() : null);
            setOpen(false);
          }}
        />
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
