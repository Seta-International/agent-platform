import { Button, Textarea } from '@seta/shared-ui';
import { useState } from 'react';
import { usePostComment } from '../hooks/mutations/post-comment';

interface Props {
  taskId: string;
}

const MAX = 4000;

export function CommentComposer({ taskId }: Props) {
  const [body, setBody] = useState('');
  const [expanded, setExpanded] = useState(false);
  const postComment = usePostComment();

  const trimmed = body.trim();
  const tooLong = body.length > MAX;
  const canPost = trimmed.length > 0 && !tooLong && !postComment.isPending;

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
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-md border border-hairline bg-surface-1 px-3 py-2 text-left text-sm text-ink-tertiary hover:bg-surface-2"
      >
        Write a comment…
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a comment…"
        rows={3}
        className="resize-y"
      />
      <div className="flex items-center justify-between">
        <span className={`text-caption ${tooLong ? 'text-semantic-danger' : 'text-ink-tertiary'}`}>
          {body.length > MAX - 500 ? `${body.length} / ${MAX}` : ''}
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setBody('');
              setExpanded(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handlePost} disabled={!canPost}>
            Post
          </Button>
        </div>
      </div>
    </div>
  );
}
