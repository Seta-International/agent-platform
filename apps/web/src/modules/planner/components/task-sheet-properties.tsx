import { Popover, PopoverContent, PopoverTrigger, ProgressBar } from '@seta/shared-ui';
import { useState } from 'react';

export type ProgressValue = 'not_started' | 'in_progress' | 'completed' | 'deferred';
export type PriorityValue = 'urgent' | 'important' | 'medium' | 'low';
export type ReviewState = 'needs_review' | null;

interface BucketOption {
  id: string;
  name: string;
}

interface MemberOption {
  user_id: string;
  display_name: string;
}

interface LabelOption {
  id: string;
  name: string;
  color?: string;
}

export interface TaskSheetPropertiesProps {
  status: ProgressValue;
  onStatusChange: (next: ProgressValue) => void;
  bucketId: string | null;
  bucketOptions: ReadonlyArray<BucketOption>;
  onBucketChange: (next: string | null) => void;
  priority: PriorityValue;
  onPriorityChange: (next: PriorityValue) => void;
  due: string | null;
  onDueChange: (next: string | null) => void;
  assignees: ReadonlyArray<MemberOption>;
  memberOptions: ReadonlyArray<MemberOption>;
  onAssign: (userId: string) => void;
  onUnassign: (userId: string) => void;
  appliedLabels: ReadonlyArray<LabelOption>;
  labelOptions: ReadonlyArray<LabelOption>;
  onApplyLabel: (labelId: string) => void;
  onUnapplyLabel: (labelId: string) => void;
  reviewState: ReviewState;
  onReviewStateChange: (next: ReviewState) => void;
  skillTags: ReadonlyArray<string>;
  onSkillTagsChange: (next: string[]) => void;
  checklistChecked: number;
  checklistTotal: number;
}

const STATUS_LABELS: Record<ProgressValue, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  deferred: 'Deferred',
};

const PRIORITY_LABELS: Record<PriorityValue, string> = {
  urgent: 'Urgent',
  important: 'Important',
  medium: 'Medium',
  low: 'Low',
};

export function TaskSheetProperties(props: TaskSheetPropertiesProps) {
  return (
    <>
      <h3 className="task-sheet__section-title">Properties</h3>
      <dl className="task-sheet__props">
        <dt>Status</dt>
        <dd>
          <SelectPopover
            label="Edit status"
            value={props.status}
            display={STATUS_LABELS[props.status]}
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({
              value: value as ProgressValue,
              label,
            }))}
            onChange={(v) => props.onStatusChange(v)}
          />
        </dd>
        <dt>Bucket</dt>
        <dd>
          <SelectPopover
            label="Edit bucket"
            value={props.bucketId ?? ''}
            display={props.bucketOptions.find((b) => b.id === props.bucketId)?.name ?? 'No bucket'}
            options={[
              { value: '', label: 'No bucket' },
              ...props.bucketOptions.map((b) => ({ value: b.id, label: b.name })),
            ]}
            onChange={(v) => props.onBucketChange(v === '' ? null : v)}
          />
        </dd>
        <dt>Priority</dt>
        <dd>
          <SelectPopover
            label="Edit priority"
            value={props.priority}
            display={PRIORITY_LABELS[props.priority]}
            options={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({
              value: value as PriorityValue,
              label,
            }))}
            onChange={(v) => props.onPriorityChange(v)}
          />
        </dd>
        <dt>Due</dt>
        <dd>
          <DateCell value={props.due} onChange={props.onDueChange} />
        </dd>
        <dt>Assignees</dt>
        <dd>
          <AssigneePopover
            assignees={props.assignees}
            memberOptions={props.memberOptions}
            onAssign={props.onAssign}
            onUnassign={props.onUnassign}
          />
        </dd>
        <dt>Labels</dt>
        <dd>
          <LabelPopover
            applied={props.appliedLabels}
            options={props.labelOptions}
            onApply={props.onApplyLabel}
            onUnapply={props.onUnapplyLabel}
          />
        </dd>
        <dt>Review state</dt>
        <dd>
          <SelectPopover
            label="Edit review state"
            value={props.reviewState ?? ''}
            display={props.reviewState === 'needs_review' ? 'Needs review' : 'None'}
            options={[
              { value: '', label: 'None' },
              { value: 'needs_review', label: 'Needs review' },
            ]}
            onChange={(v) =>
              props.onReviewStateChange(v === 'needs_review' ? 'needs_review' : null)
            }
          />
        </dd>
        <dt>Skill tags</dt>
        <dd>
          <SkillTagsCell value={props.skillTags} onChange={props.onSkillTagsChange} />
        </dd>
        <dt>Progress</dt>
        <dd>
          <ProgressBar value={props.checklistChecked} total={props.checklistTotal || 1} />
        </dd>
      </dl>
    </>
  );
}

interface SelectPopoverProps<T extends string> {
  label: string;
  value: T;
  display: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
}

function SelectPopover<T extends string>({
  label,
  display,
  options,
  value,
  onChange,
}: SelectPopoverProps<T>) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="task-sheet__prop-trigger" aria-label={label}>
          {display}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-current={o.value === value}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-surface-2"
            onClick={() => {
              if (o.value !== value) onChange(o.value);
              setOpen(false);
            }}
          >
            {o.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function DateCell({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        type="date"
        // biome-ignore lint/a11y/noAutofocus: inline editor must steal focus immediately
        autoFocus
        defaultValue={value ? value.slice(0, 10) : ''}
        aria-label="Edit due date"
        onBlur={(e) => {
          onChange(e.target.value ? new Date(e.target.value).toISOString() : null);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <button type="button" className="task-sheet__prop-trigger" onClick={() => setEditing(true)}>
      {value ? new Date(value).toLocaleDateString() : '—'}
    </button>
  );
}

function AssigneePopover({
  assignees,
  memberOptions,
  onAssign,
  onUnassign,
}: {
  assignees: ReadonlyArray<MemberOption>;
  memberOptions: ReadonlyArray<MemberOption>;
  onAssign: (userId: string) => void;
  onUnassign: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const assignedSet = new Set(assignees.map((a) => a.user_id));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="task-sheet__prop-trigger" aria-label="Edit assignees">
          {assignees.length === 0 ? 'Unassigned' : assignees.map((a) => a.display_name).join(', ')}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {memberOptions.length === 0 ? (
          <p className="px-2 py-2 text-sm text-ink-subtle">No members.</p>
        ) : (
          memberOptions.map((m) => {
            const isAssigned = assignedSet.has(m.user_id);
            return (
              <button
                key={m.user_id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={isAssigned}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-surface-2"
                onClick={() => (isAssigned ? onUnassign(m.user_id) : onAssign(m.user_id))}
              >
                <span>{m.display_name}</span>
                {isAssigned && <span aria-hidden="true">✓</span>}
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}

function LabelPopover({
  applied,
  options,
  onApply,
  onUnapply,
}: {
  applied: ReadonlyArray<LabelOption>;
  options: ReadonlyArray<LabelOption>;
  onApply: (labelId: string) => void;
  onUnapply: (labelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const appliedSet = new Set(applied.map((l) => l.id));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="task-sheet__prop-trigger" aria-label="Edit labels">
          {applied.length === 0 ? 'None' : applied.map((l) => l.name).join(', ')}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {options.length === 0 ? (
          <p className="px-2 py-2 text-sm text-ink-subtle">No labels.</p>
        ) : (
          options.map((l) => {
            const isApplied = appliedSet.has(l.id);
            return (
              <button
                key={l.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={isApplied}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-surface-2"
                onClick={() => (isApplied ? onUnapply(l.id) : onApply(l.id))}
              >
                <span>{l.name}</span>
                {isApplied && <span aria-hidden="true">✓</span>}
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}

function SkillTagsCell({
  value,
  onChange,
}: {
  value: ReadonlyArray<string>;
  onChange: (next: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        type="text"
        // biome-ignore lint/a11y/noAutofocus: inline editor must steal focus immediately
        autoFocus
        defaultValue={value.join(', ')}
        aria-label="Edit skill tags"
        placeholder="comma-separated"
        onBlur={(e) => {
          const next = e.target.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          if (JSON.stringify(next) !== JSON.stringify([...value])) onChange(next);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(false);
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    );
  }
  return (
    <button type="button" className="task-sheet__prop-trigger" onClick={() => setEditing(true)}>
      {value.length === 0 ? '—' : value.join(', ')}
    </button>
  );
}
