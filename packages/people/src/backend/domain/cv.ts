import { canonicalizeSkill, requireSkillPermission, type SessionScope } from '@seta/core';
import { type CvProfileDraft, type ParseCvProfileDeps, parseCvProfile } from '@seta/knowledge';
import { tenantScoped } from '@seta/shared-rbac';
import { buildTenantKey, presignedDownloadUrl, presignedUploadUrl } from '@seta/shared-storage';
import { and, eq, isNull } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { person } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';

export const CV_ALLOWED_EXTENSIONS = new Set(['pdf', 'docx']);
export const CV_MAX_BYTES = 10 * 1024 * 1024;
const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

function cvBucket(): string {
  return process.env.S3_BUCKET ?? 'seta-knowledge';
}

export interface WorkerCvDraft {
  full_name: string | null;
  personal_email: string | null;
  phone: string | null;
  dob: string | null;
  gender: 'male' | 'female' | null;
  job_title: string | null;
  /** Catalog skills resolved from LLM names (slug + alias). */
  skills: Array<{ skill_id: string; skill_name: string }>;
  /** Names with no catalog match — surfaced as suggestions, never auto-created. */
  skill_suggestions: string[];
  summary: string | null;
}

/**
 * Resolve raw skill names via core slug + alias canonicalization.
 * Callers without core.skill.read simply get everything as suggestions.
 * Synonyms that map to the same skill_id are de-duplicated.
 */
export async function matchSkillsToCatalog(
  session: SessionScope,
  names: string[],
): Promise<{ skills: WorkerCvDraft['skills']; suggestions: string[] }> {
  // Gate on the catalog-read permission without fetching the whole catalog:
  // canonicalizeSkill below is a normalization utility that does not re-check it.
  try {
    requireSkillPermission(session, 'core.skill.read');
  } catch {
    const suggestions: string[] = [];
    const seen = new Set<string>();
    for (const raw of names) {
      const norm = raw.trim();
      if (!norm || seen.has(norm.toLowerCase())) continue;
      seen.add(norm.toLowerCase());
      suggestions.push(norm);
    }
    return { skills: [], suggestions };
  }

  const skills: WorkerCvDraft['skills'] = [];
  const suggestions: string[] = [];
  const seenRaw = new Set<string>();
  const seenIds = new Set<string>();
  for (const raw of names) {
    const norm = raw.trim();
    if (!norm || seenRaw.has(norm.toLowerCase())) continue;
    seenRaw.add(norm.toLowerCase());
    const hit = await canonicalizeSkill(session, norm);
    if (hit) {
      if (!seenIds.has(hit.skill_id)) {
        seenIds.add(hit.skill_id);
        skills.push({ skill_id: hit.skill_id, skill_name: hit.name });
      }
    } else {
      suggestions.push(norm);
    }
  }
  return { skills, suggestions };
}

export interface ParseWorkerCvDeps {
  resolveModel: () => ParseCvProfileDeps['model'];
  /** Parser override for tests. */
  extract?: ParseCvProfileDeps['extract'];
}

/**
 * Stateless CV → worker form draft. Persists nothing: the reviewing user
 * decides what to keep before the worker is created.
 */
export async function parseWorkerCvDraft(
  input: { buffer: Buffer; filename: string; session: SessionScope },
  deps: ParseWorkerCvDeps,
): Promise<WorkerCvDraft> {
  requirePermission(input.session, 'people.worker.create');
  const profile: CvProfileDraft = await parseCvProfile(input.buffer, input.filename, {
    model: deps.resolveModel(),
    extract: deps.extract,
  });
  const { skills, suggestions } = await matchSkillsToCatalog(input.session, profile.skills);
  return {
    full_name: profile.full_name,
    personal_email: profile.personal_email,
    phone: profile.phone,
    dob: profile.dob,
    gender: profile.gender,
    job_title: profile.current_title,
    skills,
    skill_suggestions: suggestions,
    summary: profile.summary,
  };
}

async function requireWorkerRow(worker_id: string, session: SessionScope) {
  const [row] = await peopleDb()
    .select({ person_id: person.id, cv_storage_key: person.cv_storage_key })
    .from(person)
    .where(
      and(
        eq(person.id, worker_id),
        tenantScoped(person.tenant_id, session),
        isNull(person.deleted_at),
      ),
    )
    .limit(1);
  if (!row) throw new PeopleError('NOT_FOUND', 'worker not found');
  return row;
}

export interface CvPresignDeps {
  presignUpload?: typeof presignedUploadUrl;
  presignDownload?: typeof presignedDownloadUrl;
}

/** Presigned PUT for the worker's CV. The key is only persisted by editWorker after the PUT succeeds. */
export async function requestWorkerCvUpload(
  input: { worker_id: string; filename: string; content_type: string; session: SessionScope },
  deps: CvPresignDeps = {},
): Promise<{ upload_url: string; s3_key: string }> {
  requirePermission(input.session, 'people.worker.update');
  await requireWorkerRow(input.worker_id, input.session);

  const ext = input.filename.split('.').pop()?.toLowerCase() ?? '';
  if (!CV_ALLOWED_EXTENSIONS.has(ext)) {
    throw new PeopleError('VALIDATION', `CV must be PDF or DOCX (got .${ext})`);
  }

  const s3_key = buildTenantKey({
    tenant_id: input.session.tenant_id,
    domain: 'people-cv',
    file_id: input.worker_id,
    filename: input.filename,
  });
  const presign = deps.presignUpload ?? presignedUploadUrl;
  const upload_url = await presign({
    bucket: cvBucket(),
    key: s3_key,
    contentType: input.content_type,
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
  });
  return { upload_url, s3_key };
}

export async function workerCvDownloadUrl(
  input: { worker_id: string; session: SessionScope },
  deps: CvPresignDeps = {},
): Promise<{ download_url: string }> {
  requirePermission(input.session, 'people.worker.read');
  const row = await requireWorkerRow(input.worker_id, input.session);
  if (!row.cv_storage_key) throw new PeopleError('NOT_FOUND', 'worker has no CV on file');

  const presign = deps.presignDownload ?? presignedDownloadUrl;
  const download_url = await presign({
    bucket: cvBucket(),
    key: row.cv_storage_key,
    expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
  });
  return { download_url };
}
