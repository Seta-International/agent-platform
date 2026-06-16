import type { CommentDto, CommentListResult } from '@seta/planner';
import { useSession } from '@seta/web-identity';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

interface PostVars {
  taskId: string;
  body: string;
}

interface PageShape {
  pages: CommentListResult[];
  pageParams: unknown[];
}

export function usePostComment() {
  const qc = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationFn: ({ taskId, body }: PostVars) =>
      plannerClient.postComment({ task_id: taskId, body }),
    onMutate: async ({ taskId, body }) => {
      const key = plannerKeys.taskComments(taskId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PageShape>(key);
      const optimistic: CommentDto = {
        id: `tmp-${crypto.randomUUID()}`,
        task_id: taskId,
        author_id: session.user_id,
        author_display_name: session.display_name,
        body,
        created_at: new Date().toISOString(),
        edited_at: null,
      };
      qc.setQueryData<PageShape>(key, (old) => {
        if (!old) {
          return {
            pages: [{ comments: [optimistic], has_more: false }],
            pageParams: [undefined],
          };
        }
        const [first, ...rest] = old.pages;
        const firstPage = first ?? { comments: [], has_more: false };
        return {
          ...old,
          pages: [{ ...firstPage, comments: [optimistic, ...firstPage.comments] }, ...rest],
        };
      });
      return { prev, optimisticId: optimistic.id };
    },
    onError: (_e, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(plannerKeys.taskComments(vars.taskId), ctx.prev);
    },
    onSuccess: (real, vars, ctx) => {
      qc.setQueryData<PageShape>(plannerKeys.taskComments(vars.taskId), (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((p, i) =>
            i === 0
              ? { ...p, comments: p.comments.map((c) => (c.id === ctx?.optimisticId ? real : c)) }
              : p,
          ),
        };
      });
    },
  });
}
