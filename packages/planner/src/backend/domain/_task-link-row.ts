import { TASK_LINK_KINDS } from '../db/schema.ts';
import type { TaskLinkKind } from '../dto.ts';

/**
 * A link's identity is the target's PLAN-FREE canonical path. Plan-scoped urls
 * rot: `moveTask` supports cross-plan moves, so `/planner/plans/<plan>/tasks/<id>`
 * stops matching the moment the target moves, and the
 * UNIQUE (tenant_id, task_id, url) index then fails to recognise a re-link as a
 * duplicate (design §0.2).
 */
export const TASK_LINK_URL_PREFIX = '/planner/tasks/';

export function taskLinkUrl(taskId: string): string {
  return `${TASK_LINK_URL_PREFIX}${taskId}`;
}

/** The other half of the identity: the target id lives inside the url, and the
 *  `task_references_link_url_canonical` CHECK guarantees this slice is a uuid on
 *  every row whose `type` is a link kind. */
export function taskIdFromLinkUrl(url: string): string {
  return url.slice(TASK_LINK_URL_PREFIX.length);
}

/** THE discriminator. A row of task_references is a task link iff this is true;
 *  `'link'` is a bookmark kind and returns false (design §3.1). */
export function isTaskLinkKind(type: string): type is TaskLinkKind {
  return (TASK_LINK_KINDS as readonly string[]).includes(type);
}

/** Mutable copy for drizzle's `inArray`, which does not take a readonly tuple. */
export const TASK_LINK_KIND_LIST: TaskLinkKind[] = [...TASK_LINK_KINDS];
