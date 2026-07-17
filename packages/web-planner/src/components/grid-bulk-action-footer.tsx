import {
  Button,
  createStaticSource,
  DateInput,
  DisabledActionTooltip,
  Popover,
  type SearchableItem,
  Typeahead,
  VStack,
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
      className="sticky bottom-0 flex items-center gap-3 border-border border-t bg-card px-4 py-3"
      aria-label={`${count} tasks selected`}
    >
      <span>
        <strong>{count}</strong> selected
      </span>
      <BucketMenu options={bucketOptions} onPick={onMove} disabled={!canMove} />
      <AssigneeMenu groupId={groupId} onPick={onAssign} disabled={!canAssign} />
      <DueMenu onPick={onSetDue} disabled={!canSetDue} />
      <DisabledActionTooltip disabled={!canDelete} reason={PERMISSION_DENIED.task.delete}>
        <Button
          size="sm"
          variant="secondary"
          label="Delete"
          isDisabled={!canDelete}
          onClick={onDelete}
        />
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
        <Button size="sm" variant="secondary" label="Move" isDisabled />
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
            className="flex w-full items-center rounded px-2 py-1.5 text-sm hover:bg-surface"
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
              className="flex w-full items-center rounded px-2 py-1.5 text-sm hover:bg-surface"
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
      <Button size="sm" variant="secondary" label="Move" />
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
          <span className="truncate text-base leading-tight text-primary">{item.label}</span>
          <span className="truncate text-sm leading-tight text-secondary">
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
  const [draft, setDraft] = useState<string | undefined>(undefined);
  if (disabled) {
    return (
      <DisabledActionTooltip disabled reason={PERMISSION_DENIED.task.edit}>
        <Button size="sm" variant="secondary" label="Set due" isDisabled />
      </DisabledActionTooltip>
    );
  }
  return (
    <Popover
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(undefined);
      }}
      alignment="start"
      width={224}
      label="Set due date"
      content={
        <VStack gap={2} hAlign="stretch">
          {/* DateInput emits onChange per parseable keystroke, so the draft is
              committed explicitly rather than on change — see Apply below. */}
          <DateInput label="Due date" value={draft} onChange={(v) => setDraft(v)} width="100%" />
          <Button
            label="Apply"
            variant="primary"
            isDisabled={!draft}
            onClick={() => {
              onPick(draft ? new Date(draft).toISOString() : null);
              setOpen(false);
            }}
          />
          <Button
            label="Clear due date"
            variant="ghost"
            onClick={() => {
              onPick(null);
              setOpen(false);
            }}
          />
        </VStack>
      }
    >
      <Button size="sm" variant="secondary" label="Set due" />
    </Popover>
  );
}
