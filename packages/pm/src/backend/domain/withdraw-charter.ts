import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq } from 'drizzle-orm';
import { PM_CHARTER_WITHDRAWN } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import { project, projectApproval } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';

export async function withdrawCharter(input: {
  charter_id: string;
  expected_version?: number;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { charter_id, session } = input;
  requirePermission(session, 'pm.charter.submit');

  const [c] = await pmDb()
    .select({
      status: project.status,
      version: project.version,
      submitted_by_user_id: projectApproval.submitted_by_user_id,
    })
    .from(project)
    .leftJoin(
      projectApproval,
      and(
        eq(projectApproval.project_id, project.id),
        tenantScoped(projectApproval.tenant_id, session),
      ),
    )
    .where(and(eq(project.id, charter_id), tenantScoped(project.tenant_id, session)))
    .limit(1);
  if (!c) throw new PmError('NOT_FOUND', 'charter not found');
  if (c.status !== 'submitted' && c.status !== 'pmo_approved') {
    throw new PmError('CONFLICT', 'charter is not withdrawable');
  }
  if (c.submitted_by_user_id !== session.user_id) {
    throw new PmError('FORBIDDEN', 'only the submitter can withdraw this charter');
  }
  if (input.expected_version !== undefined && input.expected_version !== c.version) {
    throw new PmError('CONFLICT', 'version mismatch');
  }

  const nextVersion = c.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(project)
        .set({ status: 'withdrawn', version: nextVersion, updated_at: new Date() })
        .where(
          and(
            eq(project.id, charter_id),
            eq(project.version, c.version),
            eq(project.status, c.status),
          ),
        )
        .returning({ id: project.id });
      if (updated.length === 0) throw new PmError('CONFLICT', 'charter was modified concurrently');
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.charter',
        aggregateId: charter_id,
        eventType: PM_CHARTER_WITHDRAWN,
        eventVersion: 1,
        payload: { charter_id, tenant_id: session.tenant_id },
      });
    },
  );
  return { version: nextVersion };
}
