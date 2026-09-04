import { resolveTaskRef } from '@seta/agent-sdk';
import type { ActorRef, TaskLinkPort } from './ports.ts';
import type { ActionTaskSnapshot } from './schemas.ts';

/**
 * The ONE sentence a caller gets when an endpoint cannot be used, whatever the
 * reason: the task does not exist, is in another tenant, or sits in a group the
 * actor may not read. Byte-identical across all three, which is the only way
 * FUT-805 AC3 is testable — and the reason the port normalises rather than the
 * tool branching on a code.
 */
export const UNRESOLVABLE_ENDPOINT = (ref: string) => `I can't find a task called "${ref}".`;

export interface ResolveTwoEndpointsOpts {
  port: Pick<TaskLinkPort, 'readEndpoint' | 'assertCanLink'>;
  actor: ActorRef;
  toolCtx: unknown;
  sourceRef: string;
  targetRef: string;
}

export type ResolveTwoEndpointsResult =
  | { ok: true; source: ActionTaskSnapshot; target: ActionTaskSnapshot }
  | { ok: false; refusal: string };

/**
 * Shared by `planner_linkTasks` and `planner_mergeTasks`. It is a helper rather
 * than one tool with a `mode` parameter (design D6): merge also sends a task to
 * trash, so a single wrong enum value would turn "link these two" into "trash one
 * of these". Risk behind a parameter is the poka-yoke anti-pattern.
 */
export async function resolveTwoEndpoints(
  opts: ResolveTwoEndpointsOpts,
): Promise<ResolveTwoEndpointsResult> {
  const { port, actor, toolCtx, sourceRef, targetRef } = opts;

  // A TaskRefResolveError propagates untouched — it is an AgentToolError, so
  // wrapExecute keeps its text and the model self-corrects (FUT-859).
  const sourceId = (await resolveTaskRef(toolCtx as never, sourceRef)).taskId;
  const targetId = (await resolveTaskRef(toolCtx as never, targetRef)).taskId;

  if (sourceId === targetId) {
    return { ok: false, refusal: 'Those two references point at the same task.' };
  }

  const source = await port.readEndpoint({ ...actor, taskId: sourceId });
  if (!source) return { ok: false, refusal: UNRESOLVABLE_ENDPOINT(sourceRef) };
  const target = await port.readEndpoint({ ...actor, taskId: targetId });
  if (!target) return { ok: false, refusal: UNRESOLVABLE_ENDPOINT(targetRef) };

  // The two-endpoint gate, on BOTH groups. This is what FUT-820 is for.
  await port.assertCanLink({ ...actor, groupIds: [source.groupId, target.groupId] });

  return { ok: true, source, target };
}
