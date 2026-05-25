import { type TaskDraft, TaskDraftSchema } from '../schemas.ts';

const clean = (s: string): string => s.trim().replace(/\s+/g, ' ');

export function normalizeDraft(input: unknown): TaskDraft {
  const parsed = TaskDraftSchema.parse(input);
  return {
    ...parsed,
    title: clean(parsed.title),
    description: clean(parsed.description),
  };
}
