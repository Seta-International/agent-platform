import { Button, Input } from '@seta/shared-ui';
import { useState } from 'react';
import { useCreateTask } from '../../hooks/mutations/create-task';
import { apiTo, fromDateKey } from '../../lib/calendar-dates';

const dateLabelFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

interface Props {
  planId: string;
  /** YYYY-MM-DD of the clicked day; becomes the new task's due date. */
  dueDate: string;
  onClose: () => void;
}

export function CalendarQuickCreate({ planId, dueDate, onClose }: Props) {
  const [title, setTitle] = useState('');
  const createTask = useCreateTask(planId);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed || createTask.isPending) return;
    createTask.mutate(
      { plan_id: planId, title: trimmed, due_at: apiTo(dueDate) },
      { onSuccess: onClose },
    );
  }

  return (
    <form
      data-testid="calendar-quick-create"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex w-64 flex-col gap-2 rounded-md border border-border bg-card p-2 shadow-lg"
    >
      <span className="text-sm text-secondary">
        New task — due {dateLabelFmt.format(fromDateKey(dueDate))}
      </span>
      <Input
        hasAutoFocus
        label="Task title"
        isLabelHidden
        placeholder="Task title"
        value={title}
        onChange={(value) => setTitle(value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" label="Cancel" onClick={onClose} />
        <Button
          type="submit"
          size="sm"
          label="Create"
          isDisabled={!title.trim() || createTask.isPending}
        />
      </div>
    </form>
  );
}
