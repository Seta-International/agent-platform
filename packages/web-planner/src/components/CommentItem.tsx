import type { CommentDto } from '@seta/planner';
import { Button, DropdownMenu, DropdownMenuItem, formatRelative, Textarea } from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useDeleteComment } from '../hooks/mutations/delete-comment';
import { useUpdateComment } from '../hooks/mutations/update-comment';

interface Props {
  taskId: string;
  comment: CommentDto;
  currentUserId: string;
  isGroupOwner: boolean;
}

const MAX = 4000;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function CommentItem({ taskId, comment, currentUserId, isGroupOwner }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const update = useUpdateComment();
  const del = useDeleteComment();
  const canComment = usePermission('planner.task.comment.create');

  const isAuthor = comment.author_id === currentUserId;
  // Editing a comment hits the same endpoint as creating one (requires comment.create).
  const canEdit = isAuthor && canComment;
  const canDelete = isAuthor || isGroupOwner;

  function handleSave() {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || draft.length > MAX) return;
    update.mutate(
      { taskId, commentId: comment.id, body: draft },
      { onSuccess: () => setEditing(false) },
    );
  }

  return (
    <article className="flex gap-3">
      <div
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-medium text-secondary"
      >
        {initials(comment.author_display_name)}
      </div>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2 text-secondary">
            <span className="font-medium text-primary">{comment.author_display_name}</span>
            <time
              title={new Date(comment.created_at).toLocaleString()}
              dateTime={comment.created_at}
            >
              {formatRelative(comment.created_at)}
            </time>
            {comment.edited_at && (
              <span
                className="text-disabled"
                title={`edited ${new Date(comment.edited_at).toLocaleString()}`}
              >
                · edited
              </span>
            )}
          </div>
          {(canEdit || canDelete) && (
            <DropdownMenu
              placement="below"
              button={{
                isIconOnly: true,
                icon: <MoreHorizontal className="size-4" />,
                variant: 'ghost',
                size: 'sm',
                label: 'Comment actions',
              }}
            >
              {canEdit && <DropdownMenuItem label="Edit" onClick={() => setEditing(true)} />}
              {canDelete && (
                <DropdownMenuItem
                  label="Delete"
                  style={{ color: 'var(--color-error)' }}
                  onClick={() => del.mutate({ taskId, commentId: comment.id })}
                />
              )}
            </DropdownMenu>
          )}
        </header>
        {editing ? (
          <div className="mt-1 flex flex-col gap-2">
            <Textarea
              label="Edit comment"
              isLabelHidden
              value={draft}
              onChange={(value) => setDraft(value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                label="Cancel"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(false);
                }}
              />
              <Button label="Save" onClick={handleSave} isDisabled={update.isPending} />
            </div>
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-primary">{comment.body}</p>
        )}
      </div>
    </article>
  );
}
