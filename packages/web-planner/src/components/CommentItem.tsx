import type { CommentDto } from '@seta/planner';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  formatRelative,
  Textarea,
} from '@seta/shared-ui';
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

  const isAuthor = comment.author_id === currentUserId;
  const canEdit = isAuthor;
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
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-caption font-medium text-ink-muted"
      >
        {initials(comment.author_display_name)}
      </div>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-2 text-caption">
          <div className="flex items-center gap-2 text-ink-subtle">
            <span className="font-medium text-ink">{comment.author_display_name}</span>
            <time
              title={new Date(comment.created_at).toLocaleString()}
              dateTime={comment.created_at}
            >
              {formatRelative(comment.created_at)}
            </time>
            {comment.edited_at && (
              <span
                className="text-ink-tertiary"
                title={`edited ${new Date(comment.edited_at).toLocaleString()}`}
              >
                · edited
              </span>
            )}
          </div>
          {(canEdit || canDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Comment actions"
                  className="inline-flex size-6 items-center justify-center rounded text-ink-muted hover:bg-surface-2"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem onSelect={() => setEditing(true)}>Edit</DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem
                    onSelect={() => del.mutate({ taskId, commentId: comment.id })}
                    className="text-semantic-danger"
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>
        {editing ? (
          <div className="mt-1 flex flex-col gap-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={update.isPending}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{comment.body}</p>
        )}
      </div>
    </article>
  );
}
