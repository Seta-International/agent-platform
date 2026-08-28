import { createHash } from 'node:crypto';
import { canonicalizeSkill, requireSkillPermission, type SessionScope } from '@seta/core';
import { type CvProfileDraft, type ParseCvProfileDeps, parseCvProfile } from '@seta/knowledge';
import { tenantScoped } from '@seta/shared-rbac';
import { buildTenantKey, presignedDownloadUrl, presignedUploadUrl } from '@seta/shared-storage';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { hiringDb } from '../db/client.ts';
import { candidate } from '../db/schema.ts';
import { HiringError, requirePermission } from '../rbac.ts';

export const CV_ALLOWED_EXTENSIONS = new Set(['pdf', 'docx']);
export const CV_MAX_BYTES = 10 * 1024 * 1024;
const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

function cvBucket(): string {
  return process.env.S3_BUCKET ?? 'seta-knowledge';
}

export interface CandidateCvDraft {
  name: string | null;
  personal_email: string | null;
  phone: string | null;
  dob: string | null;
  gender: 'male' | 'female' | null;
  seniority: string | null;
  note: string | null;
  /** Catalog skills resolved from LLM names (slug + alias). */
  skills: Array<{ skill_id: string; skill_name: string }>;
  /** Names with no catalog match — surfaced as suggestions, never auto-created. */
  skill_suggestions: string[];
  /** SHA-256 of the uploaded file; the client echoes it back when persisting the CV. */
  cv_sha256: string;
  /** Existing candidates this upload probably duplicates (same file, email, or phone). */
  possible_duplicates: CandidateDuplicate[];
}

export interface CandidateDuplicate {
  candidate_id: string;
  name: string;
  created_at: string;
  match: 'file' | 'email' | 'phone';
}

const DUPLICATES_LIMIT = 5;

/**
 * Same-tenant candidates that look like this upload: exact file (sha256), or the
 * parsed email/phone already on record. Warning-only — re-applying is legitimate,
 * so the recruiter decides.
 */
async function findPossibleDuplicates(
  session: SessionScope,
  input: { cv_sha256: string; email: string | null; phone: string | null },
): Promise<CandidateDuplicate[]> {
  const email = input.email?.trim().toLowerCase() || null;
  const phoneDigits = input.phone?.replace(/\D/g, '') || null;
  const conditions = [eq(candidate.cv_sha256, input.cv_sha256)];
  if (email) {
    conditions.push(sql`lower(${candidate.contact}->>'personal_email') = ${email}`);
  }
  if (phoneDigits) {
    conditions.push(
      sql`regexp_replace(coalesce(${candidate.contact}->>'phone', ''), '\\D', '', 'g') = ${phoneDigits}`,
    );
  }
  const rows = await hiringDb()
    .select({
      candidate_id: candidate.id,
      name: candidate.name,
      created_at: candidate.created_at,
      cv_sha256: candidate.cv_sha256,
      contact: candidate.contact,
    })
    .from(candidate)
    .where(
      and(
        tenantScoped(candidate.tenant_id, session),
        isNull(candidate.deleted_at),
        or(...conditions),
      ),
    )
    .limit(DUPLICATES_LIMIT);
  return rows.map((r) => {
    const contact = r.contact as { personal_email?: string | null } | null;
    const match: CandidateDuplicate['match'] =
      r.cv_sha256 === input.cv_sha256
        ? 'file'
        : email && contact?.personal_email?.trim().toLowerCase() === email
          ? 'email'
          : 'phone';
    return {
      candidate_id: r.candidate_id,
      name: r.name,
      created_at: r.created_at.toISOString(),
      match,
    };
  });
}

async function matchSkillsToCatalog(
  session: SessionScope,
  names: string[],
): Promise<{ skills: CandidateCvDraft['skills']; suggestions: string[] }> {
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

  const skills: CandidateCvDraft['skills'] = [];
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

export interface ParseCandidateCvDeps {
  resolveModel: () => ParseCvProfileDeps['model'];
  /** Parser override for tests. */
  extract?: ParseCvProfileDeps['extract'];
}

/**
 * Stateless CV → candidate form draft (PRD F-CAND-1: recruiter reviews before
 * anything is saved). seniority carries the LLM's coarse hint; the form maps it
 * onto its own options. note gets the 1–2 sentence summary.
 */
export async function parseCandidateCvDraft(
  input: { buffer: Buffer; filename: string; session: SessionScope },
  deps: ParseCandidateCvDeps,
): Promise<CandidateCvDraft> {
  requirePermission(input.session, 'hiring.candidate.create');
  const cv_sha256 = createHash('sha256').update(input.buffer).digest('hex');
  const profile: CvProfileDraft = await parseCvProfile(input.buffer, input.filename, {
    model: deps.resolveModel(),
    extract: deps.extract,
  });
  const { skills, suggestions } = await matchSkillsToCatalog(input.session, profile.skills);
  const possible_duplicates = await findPossibleDuplicates(input.session, {
    cv_sha256,
    email: profile.personal_email,
    phone: profile.phone,
  });
  return {
    name: profile.full_name,
    personal_email: profile.personal_email,
    phone: profile.phone,
    dob: profile.dob,
    gender: profile.gender,
    seniority: profile.seniority_hint,
    note: profile.summary,
    skills,
    skill_suggestions: suggestions,
    cv_sha256,
    possible_duplicates,
  };
}

async function requireCandidateRow(candidate_id: string, session: SessionScope) {
  const [row] = await hiringDb()
    .select({ id: candidate.id, cv_storage_key: candidate.cv_storage_key })
    .from(candidate)
    .where(
      and(
        eq(candidate.id, candidate_id),
        tenantScoped(candidate.tenant_id, session),
        isNull(candidate.deleted_at),
      ),
    )
    .limit(1);
  if (!row) throw new HiringError('NOT_FOUND', 'candidate not found');
  return row;
}

export interface CvPresignDeps {
  presignUpload?: typeof presignedUploadUrl;
  presignDownload?: typeof presignedDownloadUrl;
}

/** Presigned PUT for the candidate's CV. The key is only persisted by editCandidate after the PUT succeeds. */
export async function requestCandidateCvUpload(
  input: { candidate_id: string; filename: string; content_type: string; session: SessionScope },
  deps: CvPresignDeps = {},
): Promise<{ upload_url: string; s3_key: string }> {
  requirePermission(input.session, 'hiring.candidate.manage');
  await requireCandidateRow(input.candidate_id, input.session);

  const ext = input.filename.split('.').pop()?.toLowerCase() ?? '';
  if (!CV_ALLOWED_EXTENSIONS.has(ext)) {
    throw new HiringError('VALIDATION', `CV must be PDF or DOCX (got .${ext})`);
  }

  const s3_key = buildTenantKey({
    tenant_id: input.session.tenant_id,
    domain: 'hiring-cv',
    file_id: input.candidate_id,
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

export async function candidateCvDownloadUrl(
  input: { candidate_id: string; session: SessionScope },
  deps: CvPresignDeps = {},
): Promise<{ download_url: string }> {
  requirePermission(input.session, 'hiring.candidate.read');
  const row = await requireCandidateRow(input.candidate_id, input.session);
  if (!row.cv_storage_key) throw new HiringError('NOT_FOUND', 'candidate has no CV on file');

  const presign = deps.presignDownload ?? presignedDownloadUrl;
  const download_url = await presign({
    bucket: cvBucket(),
    key: row.cv_storage_key,
    expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
  });
  return { download_url };
}
