import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@seta/shared-ui';
import { useState } from 'react';
import type { DuplicateOptions } from '../hooks/mutations/duplicate-task';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  taskTitle: string;
  onConfirm: (options: DuplicateOptions) => void;
  pending?: boolean;
}

// Defaults mirror the backend's duplicateTask domain: description + checklist
// carry over by default; everything else is opt-in (matches Microsoft Planner's
// "Copy task" dialog).
const DEFAULT_OPTIONS: Required<DuplicateOptions> = {
  include_description: true,
  include_checklist: true,
  include_assignees: false,
  include_labels: false,
  include_references: false,
  include_dates: false,
};

const FIELDS: ReadonlyArray<{
  key: keyof DuplicateOptions;
  label: string;
  description: string;
}> = [
  { key: 'include_description', label: 'Description', description: 'Body text and notes.' },
  { key: 'include_checklist', label: 'Checklist', description: 'Items and their checked state.' },
  { key: 'include_assignees', label: 'Assignees', description: 'Everyone assigned to the task.' },
  { key: 'include_labels', label: 'Labels', description: 'All applied labels.' },
  {
    key: 'include_references',
    label: 'Attachments',
    description: 'Links and external references.',
  },
  { key: 'include_dates', label: 'Dates', description: 'Start date and due date.' },
];

export function DuplicateTaskDialog({
  open,
  onOpenChange,
  taskTitle,
  onConfirm,
  pending = false,
}: Props) {
  const [options, setOptions] = useState<Required<DuplicateOptions>>(DEFAULT_OPTIONS);

  // Reset to defaults on close so a previous selection doesn't bleed into the
  // next copy action. Doing it in the open-change handler (instead of an
  // effect) keeps the state transition local to the user interaction.
  function handleOpenChange(next: boolean) {
    if (!next) setOptions(DEFAULT_OPTIONS);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Duplicate task</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-body-sm text-ink-subtle">
              <p>
                A copy of <span className="text-ink">&ldquo;{taskTitle}&rdquo;</span> will be added
                to the same bucket. Pick what to carry over:
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {FIELDS.map((f) => {
            const id = `duplicate-task-${f.key}`;
            const checked = options[f.key] ?? false;
            return (
              <label
                key={f.key}
                htmlFor={id}
                className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-surface-1"
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  onCheckedChange={(next) =>
                    setOptions((prev) => ({ ...prev, [f.key]: next === true }))
                  }
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm text-ink">{f.label}</span>
                  <span className="block text-caption text-ink-subtle">{f.description}</span>
                </span>
              </label>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(options)} disabled={pending}>
            Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
