export interface EmbedTaskPayload {
  tenant_id: string;
  task_id: string;
  event_id: string;
}

/**
 * No-op task-embedding handler. Job name is registered so subscribers can enqueue
 * against it; real handler replaces this file in M3.2.
 */
export const embedTaskStub = async (
  _payload: EmbedTaskPayload,
  _helpers: never,
): Promise<void> => {};
