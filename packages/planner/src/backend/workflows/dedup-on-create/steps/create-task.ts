import type { SessionScope } from '@seta/core';
import { applyLabelsByName } from '../../../domain/apply-labels-by-name.ts';
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
  const planId = input.draft.plan_id;
  const task = await createTask({
    session: input.session,
    plan_id: planId,
    bucket_id: input.draft.bucket_id,
    title: input.draft.title,
    description: input.draft.description,
  });

  // Skills are modeled as labels: find-or-create each by name, then apply.
  await applyLabelsByName({
    plan_id: planId,
    task_id: task.id,
    names: input.draft.labels,
    session: input.session,
  });

  return { taskId: task.id };
}
