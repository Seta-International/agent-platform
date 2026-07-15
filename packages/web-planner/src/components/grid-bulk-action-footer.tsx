import {
  createStaticSource,
  DateInput,
  DisabledActionTooltip,
  Popover,
  type SearchableItem,
  Typeahead,
} from '@seta/shared-ui';
import { useMemo, useState } from 'react';
import { useGroupMembers } from '../hooks/queries/use-group-members';
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
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      alignment="start"
      width={192}
      label="Move to bucket"
      content={
        <>
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
        </>
      }
    >
      <button type="button">Move</button>
    </Popover>
  );
}

type MemberItem = SearchableItem<{ email: string }>;

function AssigneeMenu({
  groupId,
  onPick,
  disabled,
}: {
  groupId: string;
  onPick: (userId: string) => void;
  disabled?: boolean;
}) {
  const { data, isPending: membersPending } = useGroupMembers(groupId);
  const members = data?.members ?? [];
  const source = useMemo(
    () =>
      createStaticSource<MemberItem>(
        members.map((m) => ({
          id: m.user_id,
          label: m.display_name,
          auxiliaryData: { email: m.email },
        })),
        { keywords: (i) => [i.auxiliaryData?.email ?? ''] },
      ),
    [members],
  );
  const [value, setValue] = useState<MemberItem | null>(null);

  return (
    <Typeahead<MemberItem>
      label="Assign to member"
      isLabelHidden
      size="sm"
      placeholder="Assign to…"
      searchSource={source}
      debounceMs={0}
      hasEntriesOnFocus
      isDisabled={disabled || membersPending}
      disabledMessage={disabled ? PERMISSION_DENIED.task.assign : 'Loading members…'}
      value={value}
      onChange={(item) => {
        if (item) {
          onPick(item.id);
          setValue(null);
        }
      }}
      renderItem={(item) => (
        <div className="flex flex-col items-start gap-0.5">
          <span className="truncate text-body-sm leading-tight text-ink">{item.label}</span>
          <span className="truncate text-caption leading-tight text-ink-subtle">
            {item.auxiliaryData?.email}
          </span>
        </div>
      )}
      emptySearchResultsText="No group members found."
    />
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
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      alignment="start"
      width={224}
      label="Set due date"
      content={
        <>
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
        </>
      }
    >
      <button type="button">Set due</button>
    </Popover>
  );
}
