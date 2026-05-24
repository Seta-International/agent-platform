export interface AssigneeResolverDeps {
  findUserByEntraOid: (input: {
    entra_oid: string;
    tenant_id: string;
  }) => Promise<{ user_id: string } | null>;
  emit: (event: { type: string; payload: unknown }) => void | Promise<void>;
}

export interface AssigneeResolveContext {
  tenantId: string;
  planId: string;
  taskId: string;
}

export interface AssigneeResolveResult {
  resolved: { entra_oid: string; user_id: string }[];
  skipped: string[];
}

export interface AssigneeResolver {
  resolveMany(entraOids: string[], ctx: AssigneeResolveContext): Promise<AssigneeResolveResult>;
}

import { assigneeSkippedCounter } from '../observability.ts';

export function createAssigneeResolver(deps: AssigneeResolverDeps): AssigneeResolver {
  return {
    async resolveMany(entraOids, ctx) {
      const resolved: { entra_oid: string; user_id: string }[] = [];
      const skipped: string[] = [];
      const seen = new Set<string>();

      for (const oid of entraOids) {
        if (seen.has(oid)) continue;
        seen.add(oid);

        const user = await deps.findUserByEntraOid({ entra_oid: oid, tenant_id: ctx.tenantId });
        if (user !== null) {
          resolved.push({ entra_oid: oid, user_id: user.user_id });
        } else {
          skipped.push(oid);
          assigneeSkippedCounter.add(1, { tenant_id: ctx.tenantId });
          await deps.emit({
            type: 'integrations.m365.assignee.skipped',
            payload: {
              tenant_id: ctx.tenantId,
              plan_id: ctx.planId,
              task_id: ctx.taskId,
              entra_oid: oid,
              reason: 'not_provisioned',
            },
          });
        }
      }

      return { resolved, skipped };
    },
  };
}
