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
    <section aria-label="Comments" className="card">
      <header className="mb-3 text-base text-secondary">
        Comments
        {totalLoaded > 0 ? ` · ${totalLoaded}${q.hasNextPage ? '+' : ''}` : ''}
      </header>

      <CommentComposer taskId={taskId} />

      {q.isPending && <p className="mt-4 text-sm text-disabled">Loading comments…</p>}
      {q.isError && (
        <p className="mt-4 text-sm text-error">
          Could not load comments.{' '}
          <button type="button" className="underline" onClick={() => void q.refetch()}>
            Retry
          </button>
        </p>
      )}

      {q.data && totalLoaded === 0 && (
        <p className="mt-4 text-sm text-disabled">No comments yet. Be the first to comment.</p>
      )}

      {totalLoaded > 0 && (
        <ul className="mt-4 flex flex-col gap-5 border-t border-border pt-4">
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
      )}

      {q.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            size="sm"
            variant="ghost"
            label="Load earlier comments"
            onClick={() => void q.fetchNextPage()}
            isDisabled={q.isFetchingNextPage}
            isLoading={q.isFetchingNextPage}
          />
        </div>
      )}
    </section>
  );
}
