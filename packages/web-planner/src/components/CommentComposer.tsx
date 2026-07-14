import { Button, DisabledActionTooltip, Textarea } from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useState } from 'react';
import { usePostComment } from '../hooks/mutations/post-comment';
import { PERMISSION_DENIED } from '../lib/permission-messages';

interface Props {
  taskId: string;
}

const MAX = 4000;

export function CommentComposer({ taskId }: Props) {
  const [body, setBody] = useState('');
  const [expanded, setExpanded] = useState(false);
  const postComment = usePostComment();
  const canComment = usePermission('planner.task.comment.create');

  const trimmed = body.trim();
  const tooLong = body.length > MAX;
  const canPost = trimmed.length > 0 && !tooLong && !postComment.isPending && canComment;

  function handlePost() {
    if (!canPost) return;
    postComment.mutate(
      { taskId, body },
      {
        onSuccess: () => {
          setBody('');
          setExpanded(false);
        },
      },
    );
  }

  if (!expanded) {
    return (
      <DisabledActionTooltip disabled={!canComment} reason={PERMISSION_DENIED.task.comment}>
        <button
          type="button"
          disabled={!canComment}
          onClick={() => setExpanded(true)}
          className="w-full rounded-md border border-hairline bg-surface-1 px-3 py-2 text-left text-sm text-ink-tertiary hover:bg-surface-2"
        >
          Write a comment…
        </button>
      </DisabledActionTooltip>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        label="Comment"
        isLabelHidden
        hasAutoFocus
        value={body}
        onChange={(value) => setBody(value)}
        placeholder="Write a comment…"
        rows={3}
        maxLength={MAX}
        status={
          tooLong
            ? { type: 'error', message: `Comment cannot exceed ${MAX} characters.` }
            : undefined
        }
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          label="Cancel"
          onClick={() => {
            setBody('');
            setExpanded(false);
          }}
        />
        <Button label="Post" onClick={handlePost} isDisabled={!canPost} />
      </div>
    </div>
  );
}
