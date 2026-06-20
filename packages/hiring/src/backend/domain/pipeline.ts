import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';
import { HIRING_APPLICATION_STAGE_CHANGED } from '../../events.ts';
import { hiringDb } from '../db/client.ts';
import { application } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { HiringError, requirePermission } from '../rbac.ts';
import { recordCandidateEvent } from './candidates.ts';

export async function moveApplicationStage(input: {
  application_id: string;
  expected_version?: number;
  to: 'new' | 'screening' | 'interview' | 'offer';
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, application_id } = input;
  requirePermission(session, 'hiring.candidate.manage');
  const [cur] = await hiringDb()
    .select({
      version: application.version,
      stage: application.stage,
      status: application.status,
      candidate_id: application.candidate_id,
    })
    .from(application)
    .where(and(eq(application.id, application_id), tenantScoped(application.tenant_id, session)))
    .limit(1);
  if (!cur) throw new HiringError('NOT_FOUND', 'application not found');
  if (input.expected_version !== undefined && input.expected_version !== cur.version)
    throw new HiringError('CONFLICT', 'version mismatch');
  if (cur.status !== 'active')
    throw new HiringError(
      'CONFLICT',
      `cannot move a ${cur.status} application — only active applications may advance`,
    );
  const next = cur.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(application)
        .set({ stage: input.to, version: next, updated_at: new Date() })
        .where(
          and(
            eq(application.id, application_id),
            eq(application.version, cur.version),
            eq(application.status, 'active'),
          ),
        )
        .returning({ id: application.id });
      if (updated.length === 0)
        throw new HiringError('CONFLICT', 'application was modified concurrently');
      if (cur.candidate_id) {
        await recordCandidateEvent(tx, {
          session,
          candidate_id: cur.candidate_id,
          application_id,
          kind: 'stage_changed',
          summary: `Moved ${cur.stage} → ${input.to}`,
          detail: { from: cur.stage, to: input.to },
        });
      }
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.application',
        aggregateId: application_id,
        eventType: HIRING_APPLICATION_STAGE_CHANGED,
        eventVersion: 1,
        payload: { application_id, tenant_id: session.tenant_id, from: cur.stage, to: input.to },
      });
    },
  );
  return { version: next };
}
