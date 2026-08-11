import { createHash } from 'node:crypto';
import { createSkill, createSkillAlias, createSkillCategory } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { MockLanguageModelV3 } from 'ai/test';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import {
  candidateCvDownloadUrl,
  parseCandidateCvDraft,
  requestCandidateCvUpload,
} from '../../src/backend/domain/cv.ts';
import { addCandidate, editCandidate, openRequisition } from '../../src/index.ts';
import { type SeededTenant, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function withDb(fn: (a: { pool: Pool; t: SeededTenant }) => Promise<void>): Promise<void> {
  return withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetHiringDb();
    initPools({ databaseUrl });
    try {
      const t = await seedTenant(pool);
      await fn({ pool, t });
    } finally {
      resetHiringDb();
      resetCoreDb();
      await closePools();
    }
  });
}

const CV_TEXT = 'Le Van D — Senior QA\nEmail: d.le@gmail.com\nSkills: Playwright, Fortran';

const LLM_DRAFT = {
  full_name: 'Le Van D',
  personal_email: 'd.le@gmail.com',
  phone: null,
  dob: null,
  gender: 'male',
  current_title: 'Senior QA',
  seniority_hint: 'senior',
  skills: ['Playwright', 'Fortran'],
  summary: 'Senior QA engineer.',
};

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
const mockModel = () =>
  new MockLanguageModelV3({
    doGenerate: async () =>
      ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: 'stop',
        usage,
        content: [{ type: 'text', text: JSON.stringify(LLM_DRAFT) }],
        warnings: [],
      }) as never,
  });

describe('parseCandidateCvDraft', () => {
  it('maps the LLM draft to candidate fields with catalog-matched skills and suggestions', () =>
    withDb(async ({ t }) => {
      const catSession = {
        ...t.adminSession,
        permissions: new Set([...t.adminSession.permissions, 'core.skill.manage']),
      };
      const cat = await createSkillCategory({ input: { name: 'QA' }, session: catSession });
      const skill = await createSkill({
        input: { category_id: cat.id, name: 'Playwright' },
        session: catSession,
      });

      const draft = await parseCandidateCvDraft(
        { buffer: Buffer.from(CV_TEXT, 'utf-8'), filename: 'cv.txt', session: t.adminSession },
        { resolveModel: () => mockModel() },
      );

      expect(draft.name).toBe('Le Van D');
      expect(draft.personal_email).toBe('d.le@gmail.com');
      expect(draft.seniority).toBe('senior');
      expect(draft.note).toBe('Senior QA engineer.');
      expect(draft.skills).toEqual([{ skill_id: skill.id, skill_name: 'Playwright' }]);
      expect(draft.skill_suggestions).toEqual(['Fortran']);
    }));

  it('resolves skill aliases (Golang → Go) and dedupes synonyms to one catalog row', () =>
    withDb(async ({ t }) => {
      const catSession = {
        ...t.adminSession,
        permissions: new Set([...t.adminSession.permissions, 'core.skill.manage']),
      };
      const cat = await createSkillCategory({ input: { name: 'Lang' }, session: catSession });
      const go = await createSkill({
        input: { category_id: cat.id, name: 'Go' },
        session: catSession,
      });
      await createSkillAlias({ input: { skill_id: go.id, alias: 'Golang' }, session: catSession });

      const draft = await parseCandidateCvDraft(
        { buffer: Buffer.from(CV_TEXT, 'utf-8'), filename: 'cv.txt', session: t.adminSession },
        {
          resolveModel: () =>
            new MockLanguageModelV3({
              doGenerate: async () =>
                ({
                  rawCall: { rawPrompt: null, rawSettings: {} },
                  finishReason: 'stop',
                  usage,
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        ...LLM_DRAFT,
                        skills: ['Golang', 'Go', 'Fortran'],
                      }),
                    },
                  ],
                  warnings: [],
                }) as never,
            }),
        },
      );

      expect(draft.skills).toEqual([{ skill_id: go.id, skill_name: 'Go' }]);
      expect(draft.skill_suggestions).toEqual(['Fortran']);
    }));
});

describe('candidate CV upload/download URLs', () => {
  it('presigns under hiring-cv; download 404s until editCandidate persists the key', () =>
    withDb(async ({ t }) => {
      const { requisition_id } = await openRequisition({
        title: 'QA Lead',
        kind: 'new',
        headcount: 1,
        session: t.adminSession,
      });
      const { candidate_id } = await addCandidate({
        requisition_id,
        name: 'CV Candidate',
        session: t.adminSession,
      });

      const presignUpload = async (args: { key: string }) => `https://s3.example/put/${args.key}`;
      const presignDownload = async (args: { key: string }) => `https://s3.example/get/${args.key}`;

      const up = await requestCandidateCvUpload(
        {
          candidate_id,
          filename: 'cv.docx',
          content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          session: t.adminSession,
        },
        { presignUpload: presignUpload as never },
      );
      expect(up.s3_key).toBe(`tenants/${t.tenant_id}/hiring-cv/${candidate_id}/cv.docx`);

      await expect(
        candidateCvDownloadUrl({ candidate_id, session: t.adminSession }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      await editCandidate({
        candidate_id,
        patch: { cv_storage_key: up.s3_key },
        session: t.adminSession,
      });

      const dl = await candidateCvDownloadUrl(
        { candidate_id, session: t.adminSession },
        { presignDownload: presignDownload as never },
      );
      expect(dl.download_url).toBe(`https://s3.example/get/${up.s3_key}`);
    }));
});

describe('parseCandidateCvDraft duplicate detection', () => {
  const buffer = () => Buffer.from(CV_TEXT, 'utf-8');
  const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

  it('flags a candidate whose stored CV has the same sha256', () =>
    withDb(async ({ t }) => {
      const { requisition_id } = await openRequisition({
        title: 'QA Lead',
        kind: 'new',
        headcount: 1,
        session: t.adminSession,
      });
      const { candidate_id } = await addCandidate({
        requisition_id,
        name: 'Existing Person',
        session: t.adminSession,
      });
      await editCandidate({
        candidate_id,
        patch: { cv_sha256: sha256(buffer()) },
        session: t.adminSession,
      });

      const draft = await parseCandidateCvDraft(
        { buffer: buffer(), filename: 'cv.txt', session: t.adminSession },
        { resolveModel: () => mockModel() },
      );
      expect(draft.cv_sha256).toBe(sha256(buffer()));
      expect(draft.possible_duplicates).toEqual([
        expect.objectContaining({ candidate_id, name: 'Existing Person', match: 'file' }),
      ]);
    }));

  it('flags a candidate whose contact email matches the parsed email', () =>
    withDb(async ({ t }) => {
      const { requisition_id } = await openRequisition({
        title: 'QA Lead',
        kind: 'new',
        headcount: 1,
        session: t.adminSession,
      });
      const { candidate_id } = await addCandidate({
        requisition_id,
        name: 'Same Email Person',
        personal_email: 'D.Le@gmail.com',
        session: t.adminSession,
      });

      const draft = await parseCandidateCvDraft(
        { buffer: buffer(), filename: 'cv.txt', session: t.adminSession },
        { resolveModel: () => mockModel() },
      );
      expect(draft.possible_duplicates).toEqual([
        expect.objectContaining({ candidate_id, name: 'Same Email Person', match: 'email' }),
      ]);
    }));

  it('ignores soft-deleted candidates; empty when nothing matches', () =>
    withDb(async ({ pool, t }) => {
      const { requisition_id } = await openRequisition({
        title: 'QA Lead',
        kind: 'new',
        headcount: 1,
        session: t.adminSession,
      });
      const { candidate_id } = await addCandidate({
        requisition_id,
        name: 'Deleted Person',
        personal_email: 'd.le@gmail.com',
        session: t.adminSession,
      });
      await pool.query('UPDATE hiring.candidate SET deleted_at = now() WHERE id = $1', [
        candidate_id,
      ]);

      const draft = await parseCandidateCvDraft(
        { buffer: buffer(), filename: 'cv.txt', session: t.adminSession },
        { resolveModel: () => mockModel() },
      );
      expect(draft.possible_duplicates).toEqual([]);
    }));
});
