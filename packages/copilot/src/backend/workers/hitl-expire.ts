import type { CopilotEvent } from '../../events/index.ts';
import { expireHitl, findPendingExpired } from '../hitl.ts';

export const HITL_EXPIRE_TASK_NAME = 'copilot.hitl.expire-due';

export async function expireDuePending(deps: {
  emit: (event: CopilotEvent) => Promise<void> | void;
}): Promise<number> {
  const due = await findPendingExpired();
  for (const row of due) {
    await expireHitl({ callId: row.callId });
    await deps.emit({
      type: 'copilot.hitl.expired',
      aggregate_id: `thread:${row.threadId}`,
      data: { thread_id: row.threadId, call_id: row.callId },
    });
  }
  return due.length;
}
