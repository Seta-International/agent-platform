import { Popover, PopoverContent, PopoverTrigger } from '@seta/shared-ui';
import { useState } from 'react';

export interface BulkBucketOption {
  id: string;
  name: string;
}

export interface BulkAssigneeOption {
  user_id: string;
  display_name: string;
}

interface Props {
  count: number;
  bucketOptions: ReadonlyArray<BulkBucketOption>;
  assigneeOptions: ReadonlyArray<BulkAssigneeOption>;
  onMove: (toBucketId: string | null) => void;
  onAssign: (userId: string) => void;
  onSetDue: (due: string | null) => void;
  onDelete: () => void;
}

export function GridBulkActionFooter({
  count,
  bucketOptions,
  assigneeOptions,
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
      <AssigneeMenu options={assigneeOptions} onPick={onAssign} />
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

function AssigneeMenu({
  options,
  onPick,
}: {
  options: ReadonlyArray<BulkAssigneeOption>;
  onPick: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button">Assign</button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {options.length === 0 ? (
          <p className="px-2 py-2 text-sm text-ink-subtle">No members.</p>
        ) : (
          options.map((a) => (
            <button
              key={a.user_id}
              type="button"
              className="flex w-full items-center rounded px-2 py-1.5 text-sm hover:bg-surface-2"
              onClick={() => {
                onPick(a.user_id);
                setOpen(false);
              }}
            >
              {a.display_name}
            </button>
          ))
        )}
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
