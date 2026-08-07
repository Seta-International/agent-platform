import type { TaskDetailRow, TaskLinkRow } from '@seta/planner';
import { classifyUrl, Input, ReferenceRow } from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useState } from 'react';
import { PlannerClientError } from '../api/planner-client';
import { useAddTaskReference } from '../hooks/mutations/add-task-reference';
import { useRemoveTaskReference } from '../hooks/mutations/remove-task-reference';
import { useUnlinkTask } from '../hooks/mutations/unlink-task';
import { PERMISSION_DENIED } from '../lib/permission-messages';

interface Props {
  task: TaskDetailRow;
  planId: string;
}

/** One row, two readings — `direction` says which. Matches the kind-semantics
 *  table in the FUT-805 design §3.1. */
const LINK_PHRASE: Record<TaskLinkRow['kind'], { outgoing: string; incoming: string }> = {
  relates: { outgoing: 'Related to', incoming: 'Related to' },
  duplicates: { outgoing: 'Duplicate of', incoming: 'Duplicated by' },
  blocks: { outgoing: 'Blocks', incoming: 'Blocked by' },
};

function linkLabel(l: TaskLinkRow): string {
  return `${LINK_PHRASE[l.kind][l.direction]} ${l.other_task_title}`;
}

function addErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof PlannerClientError && error.code === 'DUPLICATE_REFERENCE') {
    return 'This reference already exists on the task.';
  }
  return error instanceof Error ? error.message : 'Could not add the reference.';
}

export function TaskDetailReferencesCard({ task, planId }: Props) {
  const add = useAddTaskReference(planId);
  const remove = useRemoveTaskReference(planId);
  const unlink = useUnlinkTask(planId);
  const canUpdate = usePermission('planner.task.update');
  const errorMessage = addErrorMessage(add.error);

  return (
    <section className="card" aria-label="References">
      {task.links.length > 0 && (
        <>
          <header className="text-sm text-secondary mb-2">Related tasks</header>
          <div className="flex flex-col gap-1.5 mb-4">
            {task.links.map((l) => (
              // Dimming is REINFORCEMENT only — the row also says "In trash" in
              // its secondary line, so the state survives without colour vision.
              <div key={l.id} className={l.other_task_deleted_at ? 'opacity-60' : undefined}>
                <ReferenceRow
                  refRow={{
                    id: l.id,
                    // The in-app path the dedup workflow used to store as a
                    // task_reference URL. It is a navigation target here, never an
                    // identity — the link's identity is its own row id.
                    url: `/planner/plans/${l.other_task_plan_id}/tasks/${l.other_task_id}`,
                    alias: linkLabel(l),
                    host: l.other_task_deleted_at ? 'In trash' : 'Task',
                    type: 'link',
                  }}
                  onOpen={(row) => window.open(row.url, '_blank', 'noopener,noreferrer')}
                  onRemove={() => unlink.mutate({ link_id: l.id, task_id: task.id })}
                  // NOT `!canUpdate`. usePermission reads a FLAT permission list off
                  // the session, so the client cannot evaluate "update on BOTH
                  // groups" — and for a link, the second endpoint living in another
                  // group is the normal case, not the exception. The server computes
                  // the two-group rule and sends the answer as can_unlink.
                  removeDisabled={!l.can_unlink}
                  removeDisabledReason={PERMISSION_DENIED.task.unlink}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <header className="text-sm text-secondary mb-2">References</header>
      <div className="flex flex-col gap-1.5">
        {task.references.map((r) => (
          <ReferenceRow
            key={r.id}
            refRow={{
              id: r.id,
              url: r.url,
              alias: r.alias,
              host: hostOf(r.url),
              type: r.type,
            }}
            onOpen={(row) => window.open(row.url, '_blank', 'noopener,noreferrer')}
            onRemove={(row) => remove.mutate({ task_id: task.id, url: row.url })}
            // Still correct for a URL reference: one task, in the group of the
            // page being viewed. The two gates differ by row kind on purpose.
            removeDisabled={!canUpdate}
            removeDisabledReason={PERMISSION_DENIED.task.edit}
          />
        ))}
      </div>
      <div className="mt-2.5">
        <ReferenceInput
          disabled={!canUpdate}
          onAdd={(c) =>
            add.mutate({
              task_id: task.id,
              url: c.url,
              alias: c.alias,
              type: c.type,
            })
          }
        />
        {errorMessage && (
          <p role="alert" className="mt-1.5 text-sm text-error">
            {errorMessage}
          </p>
        )}
      </div>
    </section>
  );
}

function ReferenceInput({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (c: NonNullable<ReturnType<typeof classifyUrl>>) => void;
}) {
  const [url, setUrl] = useState('');
  return (
    <Input
      label="Add reference URL"
      isLabelHidden
      value={url}
      onChange={(v) => setUrl(v)}
      placeholder="Paste a URL to attach a reference"
      isDisabled={disabled}
      onEnter={() => {
        const c = classifyUrl(url);
        if (!c) return;
        onAdd(c);
        setUrl('');
      }}
    />
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
