import { listSkills, type SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';
import type { AddCandidateInput, CandidateSkillInput } from '../../contracts.ts';
import { HIRING_APPLICATION_CREATED, HIRING_CANDIDATE_ADDED } from '../../events.ts';
import { hiringDb } from '../db/client.ts';
import {
  application,
  candidate,
  candidateEvent,
  candidateSkill,
  requisition,
} from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { HiringError, requirePermission } from '../rbac.ts';

type Tx = Parameters<Parameters<typeof withEmit>[1]>[0];

export async function recordCandidateEvent(
  tx: Tx,
  args: {
    session: SessionScope;
    candidate_id: string;
    application_id?: string | null;
    kind: string;
    summary: string;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(candidateEvent).values({
    tenant_id: args.session.tenant_id,
    candidate_id: args.candidate_id,
    application_id: args.application_id ?? null,
    kind: args.kind,
    summary: args.summary,
    detail: args.detail ?? null,
    actor_user_id: args.session.user_id,
  });
}

export async function assertSkillsInCatalog(
  session: SessionScope,
  skills: CandidateSkillInput[],
): Promise<void> {
  if (skills.length === 0) return;
  const catalog = new Set((await listSkills(session, { activeOnly: false })).map((s) => s.id));
  for (const s of skills) {
    if (!catalog.has(s.skill_id)) {
      throw new HiringError('VALIDATION', `skill not in catalog: ${s.skill_id}`, {
        skill_id: s.skill_id,
      });
    }
  }
}

export async function addCandidate(
  input: AddCandidateInput & { session: SessionScope },
): Promise<{ candidate_id: string; application_id: string }> {
  const { session } = input;
  requirePermission(session, 'hiring.candidate.create');
  const skills = (input.skills ?? []) as CandidateSkillInput[];
  await assertSkillsInCatalog(session, skills);

  const [req] = await hiringDb()
    .select({ id: requisition.id })
    .from(requisition)
    .where(
      and(eq(requisition.id, input.requisition_id), tenantScoped(requisition.tenant_id, session)),
    )
    .limit(1);
  if (!req) throw new HiringError('NOT_FOUND', 'requisition not found');

  let result!: { candidate_id: string; application_id: string };
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const [cand] = await tx
        .insert(candidate)
        .values({
          tenant_id: session.tenant_id,
          name: input.name,
          source: input.source,
          contact: { email: input.email ?? null, phone: input.phone ?? null },
          dob: input.dob,
          gender: input.gender,
          seniority: input.seniority,
          segment: input.segment,
        })
        .returning({ id: candidate.id });
      if (!cand) throw new Error('candidate insert returned no row');

      if (skills.length) {
        await tx.insert(candidateSkill).values(
          skills.map((s) => ({
            tenant_id: session.tenant_id,
            candidate_id: cand.id,
            skill_id: s.skill_id,
            skill_name: s.skill_name,
            level: s.level,
          })),
        );
      }

      const [app] = await tx
        .insert(application)
        .values({
          tenant_id: session.tenant_id,
          requisition_id: input.requisition_id,
          kind: 'external',
          candidate_id: cand.id,
          stage: 'new',
          status: 'active',
          note: input.note,
        })
        .returning({ id: application.id });
      if (!app) throw new Error('application insert returned no row');

      await recordCandidateEvent(tx, {
        session,
        candidate_id: cand.id,
        application_id: app.id,
        kind: 'created',
        summary: `Candidate created — applying for requisition ${input.requisition_id}`,
      });

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.candidate',
        aggregateId: cand.id,
        eventType: HIRING_CANDIDATE_ADDED,
        eventVersion: 1,
        payload: { candidate_id: cand.id, tenant_id: session.tenant_id },
      });
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.application',
        aggregateId: app.id,
        eventType: HIRING_APPLICATION_CREATED,
        eventVersion: 1,
        payload: {
          application_id: app.id,
          candidate_id: cand.id,
          requisition_id: input.requisition_id,
          tenant_id: session.tenant_id,
        },
      });
      result = { candidate_id: cand.id, application_id: app.id };
    },
  );
  return result;
}
