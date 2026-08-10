import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, ErrorMapper } from '@seta/core';
import { getLifecycleEntries, registerLifecycle } from '@seta/shared-db';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { plannerAgentTools, plannerFindSimilarTasksTool } from './agent-tools.ts';
import * as schema from './backend/db/schema.ts';
import { buildPlannerRoutes } from './backend/http/index.ts';
import { PlannerError } from './backend/rbac.ts';
import { buildPlannerBoardStreamHub } from './backend/stream/index.ts';
import { plannerSubscribers } from './backend/subscribers/index.ts';
import { plannerRbac } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const plannerErrorMapper: ErrorMapper = (err) => {
  if (!(err instanceof PlannerError)) return null;
  const status: ContentfulStatusCode =
    err.code === 'FORBIDDEN'
      ? 403
      : err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'CONFLICT'
          ? 409
          : err.code === 'CROSS_TENANT'
            ? 403
            : err.code === 'VALIDATION'
              ? 400
              : err.code === 'LINKED_GROUP_IMMUTABLE_MEMBERS'
                ? 409
                : err.code === 'LINKED_DUPLICATE'
                  ? 409
                  : err.code === 'DUPLICATE_REFERENCE'
                    ? 409
                    : err.code === 'RESERVED_FOR_SYSTEM_ACTOR'
                      ? 403
                      : err.code === 'PLAN_NOT_LINKED'
                        ? 409
                        : 400;
  return { status, body: { error: err.code, message: err.message, details: err.details } };
};

export function registerPlannerContributions(reg: ContributionRegistry): void {
  // Tests construct a fresh ContributionRegistry per call (often several times per process),
  // but the shared-db lifecycle registry is process-global and throws on re-registering a
  // table — skip if a prior call in this process already ran.
  if (!getLifecycleEntries().some((e) => e.table === 'planner.groups')) {
    registerLifecycle([
      { table: 'planner.groups', policy: { kind: 'permanent' } },
      { table: 'planner.group_members', policy: { kind: 'permanent' } },
      { table: 'planner.plans', policy: { kind: 'permanent' } },
      { table: 'planner.buckets', policy: { kind: 'permanent' } },
      { table: 'planner.tasks', policy: { kind: 'permanent' } },
      { table: 'planner.task_assignments', policy: { kind: 'permanent' } },
      { table: 'planner.checklist_items', policy: { kind: 'permanent' } },
      { table: 'planner.labels', policy: { kind: 'permanent' } },
      { table: 'planner.task_labels', policy: { kind: 'permanent' } },
      { table: 'planner.task_references', policy: { kind: 'permanent' } },
      { table: 'planner.task_comments', policy: { kind: 'permanent' } },
      { table: 'planner.group_join_requests', policy: { kind: 'permanent' } },
      { table: 'planner.assignee_projection', policy: { kind: 'permanent' } },
      { table: 'planner.plan_categories', policy: { kind: 'permanent' } },
    ]);
  }

  reg.module({
    name: 'planner',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle'),
    rbac: plannerRbac,
    agentTools: plannerAgentTools,
    agentToolFactories: [plannerFindSimilarTasksTool],
    subscribers: plannerSubscribers(),
    routes: { mountAt: '/', build: buildPlannerRoutes },
    stream: buildPlannerBoardStreamHub,
    errorMapper: plannerErrorMapper,
  });
}
