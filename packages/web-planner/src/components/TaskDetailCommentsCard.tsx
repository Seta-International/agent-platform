import { Button } from '@seta/shared-ui';
import { useComments } from '../hooks/queries/use-comments';
import { CommentComposer } from './CommentComposer';
import { CommentItem } from './CommentItem';

interface Props {
  taskId: string;
  currentUserId: string;
  isGroupOwner: boolean;
}

export function TaskDetailCommentsCard({ taskId, currentUserId, isGroupOwner }: Props) {
  const q = useComments(taskId);

  const totalLoaded = q.data?.pages.reduce((acc, p) => acc + p.comments.length, 0) ?? 0;

  return (
    <section aria-label="Comments" className="rounded-lg border border-hairline bg-canvas p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">
          Comments ({totalLoaded}
          {q.hasNextPage ? '+' : ''})
        </h3>
      </header>

      <div className="mb-4">
        <CommentComposer taskId={taskId} />
      </div>

      {q.isPending && <p className="text-caption text-ink-tertiary">Loading comments…</p>}
      {q.isError && (
        <p className="text-caption text-semantic-danger">
          Could not load comments.{' '}
          <button type="button" className="underline" onClick={() => void q.refetch()}>
            Retry
          </button>
        </p>
      )}

      {q.data && totalLoaded === 0 && (
        <p className="text-caption text-ink-tertiary">No comments yet. Be the first to comment.</p>
      )}

      <ul className="flex flex-col gap-4">
        {q.data?.pages
          .flatMap((p) => p.comments)
          .map((c) => (
            <li key={c.id}>
              <CommentItem
                taskId={taskId}
                comment={c}
                currentUserId={currentUserId}
                isGroupOwner={isGroupOwner}
              />
            </li>
          ))}
      </ul>

      {q.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="ghost"
            onClick={() => void q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
          >
            {q.isFetchingNextPage ? 'Loading…' : 'Load earlier comments'}
          </Button>
        </div>
      )}
    </section>
  );
}
