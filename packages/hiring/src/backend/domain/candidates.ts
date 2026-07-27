import { listSkills, type SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type {
  AddCandidateInput,
  ApplyInternalInput,
  CandidateSkillInput,
  EditCandidatePatch,
} from '../../contracts.ts';
import {
  HIRING_APPLICATION_CREATED,
  HIRING_APPLICATION_UPDATED,
  HIRING_CANDIDATE_ADDED,
  HIRING_CANDIDATE_UPDATED,
} from '../../events.ts';
import { hiringDb } from '../db/client.ts';
import {
  application,
  type CANDIDATE_EVENT_KINDS,
  candidate,
  candidateEvent,
  candidateSkill,
  opening,
  requisition,
} from '../db/schema.ts';
import { HiringError, requirePermission } from '../rbac.ts';
import { buildRequisitionScope } from './scope.ts';

type Tx = Parameters<Parameters<typeof withEmit>[1]>[0];

/**
 * FUT-559: an on-hold requisition freezes its whole pipeline — no stage moves, rating,
 * hire, reject, or transfer until it is resumed. Shared by every application mutation.
 */
export async function assertApplicationRequisitionNotOnHold(
  application_id: string,
  session: SessionScope,
): Promise<void> {
  const [row] = await hiringDb()
    .select({ status: requisition.status })
    .from(application)
    .innerJoin(requisition, eq(requisition.id, application.requisition_id))
    .where(and(eq(application.id, application_id), tenantScoped(application.tenant_id, session)))
    .limit(1);
  if (row?.status === 'on_hold')
    throw new HiringError(
      'CONFLICT',
      'this requisition is on hold — resume it before updating its candidates',
    );
}

export async function recordCandidateEvent(
  tx: Tx,
  args: {
    session: SessionScope;
    candidate_id: string;
    application_id?: string | null;
    kind: (typeof CANDIDATE_EVENT_KINDS)[number];
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
    .select({ id: requisition.id, status: requisition.status })
    .from(requisition)
    .where(
      and(eq(requisition.id, input.requisition_id), tenantScoped(requisition.tenant_id, session)),
    )
    .limit(1);
  if (!req) throw new HiringError('NOT_FOUND', 'requisition not found');
  // FUT-765: never attach a candidate to a requisition that is closed for hiring. Two ways it
  // can be closed: a non-open status (on_hold/filled/cancelled), or — the subtler case — status
  // 'open' but every opening already hired (hireApplication fills openings without flipping the
  // requisition status). Both leave the candidate stranded, unable to progress to a hire.
  if (req.status !== 'open') {
    throw new HiringError(
      'CONFLICT',
      `requisition is ${req.status} — candidates can only be added to an open requisition`,
    );
  }
  const [openOpening] = await hiringDb()
    .select({ id: opening.id })
    .from(opening)
    .where(and(eq(opening.requisition_id, input.requisition_id), eq(opening.status, 'open')))
    .limit(1);
  if (!openOpening) {
    throw new HiringError(
      'CONFLICT',
      'requisition headcount is already filled — no open openings remain',
    );
  }

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
          contact: { personal_email: input.personal_email ?? null, phone: input.phone ?? null },
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

export async function editCandidate(input: {
  candidate_id: string;
  patch: EditCandidatePatch;
  session: SessionScope;
}): Promise<{ ok: true }> {
  const { session, candidate_id, patch } = input;
  requirePermission(session, 'hiring.candidate.manage');
  const [cur] = await hiringDb()
    .select()
    .from(candidate)
    .where(
      and(
        eq(candidate.id, candidate_id),
        tenantScoped(candidate.tenant_id, session),
        isNull(candidate.deleted_at),
      ),
    )
    .limit(1);
  if (!cur) throw new HiringError('NOT_FOUND', 'candidate not found');
  const contact = {
    personal_email:
      patch.personal_email ??
      (cur.contact as { personal_email?: string } | null)?.personal_email ??
      null,
    phone: patch.phone ?? (cur.contact as { phone?: string } | null)?.phone ?? null,
  };
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      await tx
        .update(candidate)
        .set({
          name: patch.name ?? cur.name,
          source: patch.source ?? cur.source,
          contact,
          dob: patch.dob ?? cur.dob,
          gender: patch.gender ?? cur.gender,
          seniority: patch.seniority ?? cur.seniority,
          segment: patch.segment ?? cur.segment,
          cv_storage_key:
            patch.cv_storage_key === undefined ? cur.cv_storage_key : patch.cv_storage_key,
          cv_sha256: patch.cv_sha256 === undefined ? cur.cv_sha256 : patch.cv_sha256,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(candidate.id, candidate_id),
            tenantScoped(candidate.tenant_id, session),
            isNull(candidate.deleted_at),
          ),
        );
      const fields = Object.keys(patch);
      await recordCandidateEvent(tx, {
        session,
        candidate_id,
        // emits 'note_changed' only when note is the sole changed field; any other field → 'profile_changed'
        kind: fields.includes('note') && fields.length === 1 ? 'note_changed' : 'profile_changed',
        summary: `Profile updated (${fields.join(', ')})`,
        detail: { fields },
      });
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.candidate',
        aggregateId: candidate_id,
        eventType: HIRING_CANDIDATE_UPDATED,
        eventVersion: 1,
        payload: { candidate_id, tenant_id: session.tenant_id, fields },
      });
    },
  );
  return { ok: true };
}

export async function setCandidateSkills(input: {
  candidate_id: string;
  skills: CandidateSkillInput[];
  session: SessionScope;
}): Promise<{ ok: true }> {
  const { session, candidate_id, skills } = input;
  requirePermission(session, 'hiring.candidate.manage');
  await assertSkillsInCatalog(session, skills);
  const [cur] = await hiringDb()
    .select({ id: candidate.id })
    .from(candidate)
    .where(
      and(
        eq(candidate.id, candidate_id),
        tenantScoped(candidate.tenant_id, session),
        isNull(candidate.deleted_at),
      ),
    )
    .limit(1);
  if (!cur) throw new HiringError('NOT_FOUND', 'candidate not found');
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      await tx
        .delete(candidateSkill)
        .where(
          and(
            eq(candidateSkill.candidate_id, candidate_id),
            tenantScoped(candidateSkill.tenant_id, session),
          ),
        );
      if (skills.length) {
        await tx.insert(candidateSkill).values(
          skills.map((s) => ({
            tenant_id: session.tenant_id,
            candidate_id,
            skill_id: s.skill_id,
            skill_name: s.skill_name,
            level: s.level,
          })),
        );
      }
      await recordCandidateEvent(tx, {
        session,
        candidate_id,
        kind: 'skills_changed',
        summary: `Skills updated (${skills.length})`,
      });
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.candidate',
        aggregateId: candidate_id,
        eventType: HIRING_CANDIDATE_UPDATED,
        eventVersion: 1,
        payload: { candidate_id, tenant_id: session.tenant_id, fields: ['skills'] },
      });
    },
  );
  return { ok: true };
}

export async function setApplicationRating(input: {
  application_id: string;
  expected_version?: number;
  rating: number;
  session: SessionScope;
}): Promise<{ version: number }> {
  const { session, application_id } = input;
  requirePermission(session, 'hiring.candidate.manage');
  const [cur] = await hiringDb()
    .select({ version: application.version, candidate_id: application.candidate_id })
    .from(application)
    .where(and(eq(application.id, application_id), tenantScoped(application.tenant_id, session)))
    .limit(1);
  if (!cur) throw new HiringError('NOT_FOUND', 'application not found');
  if (input.expected_version !== undefined && input.expected_version !== cur.version)
    throw new HiringError('CONFLICT', 'version mismatch');
  await assertApplicationRequisitionNotOnHold(application_id, session);
  const next = cur.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(application)
        .set({ rating: input.rating, version: next, updated_at: new Date() })
        .where(and(eq(application.id, application_id), eq(application.version, cur.version)))
        .returning({ id: application.id });
      if (updated.length === 0)
        throw new HiringError('CONFLICT', 'application was modified concurrently');
      if (cur.candidate_id) {
        await recordCandidateEvent(tx, {
          session,
          candidate_id: cur.candidate_id,
          application_id,
          kind: 'rating_changed',
          summary: `Rating set to ${input.rating}`,
        });
      }
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'hiring.application',
        aggregateId: application_id,
        eventType: HIRING_APPLICATION_UPDATED,
        eventVersion: 1,
        payload: { application_id, tenant_id: session.tenant_id, fields: ['rating'] },
      });
    },
  );
  return { version: next };
}

export async function applyInternalRequisition(
  input: ApplyInternalInput & { requisition_id: string; session: SessionScope },
): Promise<{ candidate_id: string; application_id: string }> {
  const { session, requisition_id, note } = input;
  requirePermission(session, 'hiring.requisition.read');

  const conds = [eq(requisition.id, requisition_id), tenantScoped(requisition.tenant_id, session)];
  const scope = await buildRequisitionScope(session);
  if (scope) conds.push(scope);

  const [req] = await hiringDb()
    .select({ id: requisition.id, status: requisition.status })
    .from(requisition)
    .where(and(...conds))
    .limit(1);

  if (!req) throw new HiringError('NOT_FOUND', 'requisition not found');
  if (req.status !== 'open') {
    throw new HiringError(
      'CONFLICT',
      `requisition is ${req.status} — applications are only accepted for open requisitions`,
    );
  }

  const userEmail = session.email.toLowerCase().trim();

  let result!: { candidate_id: string; application_id: string };

  try {
    await withEmit(
      { actor: { userId: session.user_id, tenantId: session.tenant_id } },
      async (tx) => {
        let candidateId: string;
        let isNewCandidate = false;

        const [existing] = await tx
          .select({ id: candidate.id })
          .from(candidate)
          .where(
            and(
              tenantScoped(candidate.tenant_id, session),
              sql`LOWER(${candidate.contact}->>'personal_email') = ${userEmail}`,
              isNull(candidate.deleted_at),
            ),
          )
          .limit(1);

        if (existing) {
          candidateId = existing.id;
        } else {
          const [created] = await tx
            .insert(candidate)
            .values({
              tenant_id: session.tenant_id,
              name: session.display_name || session.email,
              source: 'Internal application',
              contact: { personal_email: userEmail },
            })
            .returning({ id: candidate.id });

          if (!created) throw new Error('candidate insert returned no row');
          candidateId = created.id;
          isNewCandidate = true;
        }

        const [existingApp] = await tx
          .select({ id: application.id })
          .from(application)
          .where(
            and(
              tenantScoped(application.tenant_id, session),
              eq(application.requisition_id, requisition_id),
              eq(application.candidate_id, candidateId),
              inArray(application.status, ['active', 'hired']),
            ),
          )
          .limit(1);

        if (existingApp) {
          throw new HiringError('CONFLICT', 'You have already applied for this requisition');
        }

        const [app] = await tx
          .insert(application)
          .values({
            tenant_id: session.tenant_id,
            requisition_id,
            kind: 'internal',
            candidate_id: candidateId,
            stage: 'new',
            status: 'active',
            note: note ?? null,
          })
          .returning({ id: application.id });

        if (!app) throw new Error('application insert returned no row');

        await recordCandidateEvent(tx, {
          session,
          candidate_id: candidateId,
          application_id: app.id,
          kind: isNewCandidate ? 'created' : 'profile_changed',
          summary: `Internal application submitted for requisition ${requisition_id}`,
        });

        if (isNewCandidate) {
          await emit({
            tenantId: session.tenant_id,
            aggregateType: 'hiring.candidate',
            aggregateId: candidateId,
            eventType: HIRING_CANDIDATE_ADDED,
            eventVersion: 1,
            payload: { candidate_id: candidateId, tenant_id: session.tenant_id },
          });
        }

        await emit({
          tenantId: session.tenant_id,
          aggregateType: 'hiring.application',
          aggregateId: app.id,
          eventType: HIRING_APPLICATION_CREATED,
          eventVersion: 1,
          payload: {
            application_id: app.id,
            candidate_id: candidateId,
            requisition_id,
            tenant_id: session.tenant_id,
          },
        });

        result = { candidate_id: candidateId, application_id: app.id };
      },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const errorObj = err as { code?: string };
    if (
      errorObj?.code === '23505' ||
      msg.includes('application_uniq_candidate') ||
      msg.includes('duplicate key value violates unique constraint')
    ) {
      throw new HiringError('CONFLICT', 'You have already applied for this requisition');
    }
    throw err;
  }

  return result;
}
