import type { CommentListResult } from '@seta/planner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

interface UpdateVars {
  taskId: string;
  commentId: string;
  body: string;
}

interface PageShape {
  pages: CommentListResult[];
  pageParams: unknown[];
}

export function useUpdateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, body }: UpdateVars) =>
      plannerClient.updateComment({ comment_id: commentId, body }),
    onSuccess: (real, vars) => {
      qc.setQueryData<PageShape>(plannerKeys.taskComments(vars.taskId), (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            comments: p.comments.map((c) => (c.id === real.id ? real : c)),
          })),
        };
      });
    },
  });
}
