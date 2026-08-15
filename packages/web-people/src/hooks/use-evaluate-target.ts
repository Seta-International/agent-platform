import { useNavigate, useSearch } from '@tanstack/react-router';
import type { PerformanceScopeSearch } from '../state/performance-scope.ts';

export type EvaluateTarget = { subjectPersonId: string; projectId: string };

/**
 * Who the evaluation dialog is open on, held in the URL rather than in component
 * state: the dialog is then shareable ("look at this review"), Back closes it, and a
 * reload puts the evaluator back where they were. The dashboard behind it stays
 * mounted — opening an evaluation is not a navigation away from the list.
 */
export function useEvaluateTarget(): {
  target: EvaluateTarget | null;
  open: (subjectPersonId: string, projectId: string) => void;
  close: () => void;
} {
  const search = useSearch({ strict: false }) as PerformanceScopeSearch;
  const navigate = useNavigate();

  const target =
    search.subject && search.subject_project
      ? { subjectPersonId: search.subject, projectId: search.subject_project }
      : null;

  return {
    target,
    open: (subjectPersonId, projectId) =>
      void navigate({
        to: '/people/performance',
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          subject: subjectPersonId,
          subject_project: projectId,
        }),
      }),
    close: () =>
      void navigate({
        to: '/people/performance',
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          subject: undefined,
          subject_project: undefined,
        }),
      }),
  };
}
