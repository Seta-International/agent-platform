import type { CommentListResult } from '@seta/planner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

interface DeleteVars {
  taskId: string;
  commentId: string;
}

interface PageShape {
  pages: CommentListResult[];
  pageParams: unknown[];
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId }: DeleteVars) =>
      plannerClient.deleteComment({ comment_id: commentId }),
    onMutate: async ({ taskId, commentId }) => {
      const key = plannerKeys.taskComments(taskId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PageShape>(key);
      qc.setQueryData<PageShape>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            comments: p.comments.filter((c) => c.id !== commentId),
          })),
        };
      });
      return { prev };
    },
    onError: (_e, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(plannerKeys.taskComments(vars.taskId), ctx.prev);
    },
  });
}
