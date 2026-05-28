import type { SessionScope } from '@seta/core';
import { createTask } from '../../../domain/create-task.ts';
import type { TaskDraft } from '../schemas.ts';

export interface CreateTaskStepInput {
  draft: TaskDraft;
  session: SessionScope;
}

export async function createTaskStep(input: CreateTaskStepInput): Promise<{ taskId: string }> {
  if (!input.draft.plan_id) {
    throw new Error('createTaskStep: draft.plan_id is required to create a task');
  }
  const task = await createTask({
    session: input.session,
    plan_id: input.draft.plan_id,
    bucket_id: input.draft.bucket_id,
    title: input.draft.title,
    description: input.draft.description,
    skill_tags: input.draft.skill_tags,
  });
  return { taskId: task.id };
}
