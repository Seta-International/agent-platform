import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { MockLanguageModelV3 } from 'ai/test';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { resetPeopleDb } from '../../src/backend/db/client.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import {
  parseWorkerCvDraft,
  requestWorkerCvUpload,
  workerCvDownloadUrl,
} from '../../src/backend/domain/cv.ts';
import { editWorker } from '../../src/backend/domain/edit-worker.ts';
import { buildSession, type SeededTenant, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function withDb(fn: (a: { pool: Pool; t: SeededTenant }) => Promise<void>): Promise<void> {
  return withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetPeopleDb();
    initPools({ databaseUrl });
    try {
      const t = await seedTenant(pool);
      await fn({ pool, t });
    } finally {
      resetPeopleDb();
      resetCoreDb();
      await closePools();
    }
  });
}

const CV_TEXT = 'Nguyen Van B — Backend Dev\nEmail: b@gmail.com\nSkills: Go, Cobol';

const LLM_DRAFT = {
  full_name: 'Nguyen Van B',
  personal_email: 'b@gmail.com',
  phone: null,
  dob: null,
  gender: null,
  current_title: 'Backend Dev',
  seniority_hint: 'mid',
  skills: ['Go', 'Cobol'],
  summary: 'Backend developer.',
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

function modelReturning(text: string) {
  return new MockLanguageModelV3({
    doGenerate: async () =>
      ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: 'stop',
        usage,
        content: [{ type: 'text', text }],
        warnings: [],
      }) as never,
  });
}

async function seedSkill(pool: Pool, tenant_id: string, name: string): Promise<string> {
  const catId = crypto.randomUUID();
  const skillId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.skill_category (id, tenant_id, name) VALUES ($1,$2,$3)`, [
    catId,
    tenant_id,
    `Cat ${name}`,
  ]);
  await pool.query(
    `INSERT INTO core.skill (id, tenant_id, category_id, name, slug) VALUES ($1,$2,$3,$4,lower(regexp_replace($4,'[^a-zA-Z0-9]','','g')))`,
    [skillId, tenant_id, catId, name],
  );
  return skillId;
}

async function seedSkillAlias(
  pool: Pool,
  tenant_id: string,
  skill_id: string,
  alias: string,
): Promise<void> {
  const slug = alias.toLowerCase().replace(/[^a-z0-9]+/g, '');
  await pool.query(
    `INSERT INTO core.skill_alias (id, tenant_id, skill_id, alias, slug) VALUES ($1,$2,$3,$4,$5)`,
    [crypto.randomUUID(), tenant_id, skill_id, alias, slug],
  );
}

describe('parseWorkerCvDraft', () => {
  it('maps the LLM draft to worker fields and splits skills into catalog matches vs suggestions', () =>
    withDb(async ({ pool, t }) => {
      const goId = await seedSkill(pool, t.tenant_id, 'Go');

      const draft = await parseWorkerCvDraft(
        { buffer: Buffer.from(CV_TEXT, 'utf-8'), filename: 'cv.txt', session: t.adminSession },
        { resolveModel: () => mockModel() },
      );

      expect(draft.full_name).toBe('Nguyen Van B');
      expect(draft.personal_email).toBe('b@gmail.com');
      expect(draft.job_title).toBe('Backend Dev');
      expect(draft.skills).toEqual([{ skill_id: goId, skill_name: 'Go' }]);
      expect(draft.skill_suggestions).toEqual(['Cobol']);
    }));

  it('resolves Golang via alias to Go and dedupes Go+Golang to one catalog skill', () =>
    withDb(async ({ pool, t }) => {
      const goId = await seedSkill(pool, t.tenant_id, 'Go');
      await seedSkillAlias(pool, t.tenant_id, goId, 'Golang');

      const draft = await parseWorkerCvDraft(
        {
          buffer: Buffer.from(CV_TEXT, 'utf-8'),
          filename: 'cv.txt',
          session: t.adminSession,
        },
        {
          resolveModel: () =>
            modelReturning(
              JSON.stringify({
                ...LLM_DRAFT,
                skills: ['Golang', 'Go', 'Cobol'],
              }),
            ),
        },
      );

      expect(draft.skills).toEqual([{ skill_id: goId, skill_name: 'Go' }]);
      expect(draft.skill_suggestions).toEqual(['Cobol']);
    }));

  it('denies sessions without people.worker.create', () =>
    withDb(async ({ t }) => {
      const viewer = buildSession({
        tenant_id: t.tenant_id,
        user_id: crypto.randomUUID(),
        roles: ['people.viewer'],
      });
      await expect(
        parseWorkerCvDraft(
          { buffer: Buffer.from(CV_TEXT, 'utf-8'), filename: 'cv.txt', session: viewer },
          { resolveModel: () => mockModel() },
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }));
});

describe('worker CV upload/download URLs', () => {
  it('presigns an upload under the people-cv tenant prefix; download 404s until the key is patched', () =>
    withDb(async ({ t }) => {
      const { worker_id } = await createWorker({
        full_name: 'CV Upload Person',
        session: t.adminSession,
      });

      const presignUpload = async (args: { key: string }) => `https://s3.example/put/${args.key}`;
      const presignDownload = async (args: { key: string }) => `https://s3.example/get/${args.key}`;

      const up = await requestWorkerCvUpload(
        {
          worker_id,
          filename: 'my cv.pdf',
          content_type: 'application/pdf',
          session: t.adminSession,
        },
        { presignUpload: presignUpload as never },
      );
      expect(up.s3_key).toBe(`tenants/${t.tenant_id}/people-cv/${worker_id}/my cv.pdf`);
      expect(up.upload_url).toContain('/put/');

      await expect(
        workerCvDownloadUrl({ worker_id, session: t.adminSession }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      await editWorker({
        worker_id,
        session: t.adminSession,
        patch: { cv_storage_key: up.s3_key },
      });

      const dl = await workerCvDownloadUrl(
        { worker_id, session: t.adminSession },
        { presignDownload: presignDownload as never },
      );
      expect(dl.download_url).toBe(`https://s3.example/get/${up.s3_key}`);
    }));

  it('rejects non-CV extensions', () =>
    withDb(async ({ t }) => {
      const { worker_id } = await createWorker({
        full_name: 'CV Ext Person',
        session: t.adminSession,
      });
      await expect(
        requestWorkerCvUpload(
          {
            worker_id,
            filename: 'cv.exe',
            content_type: 'application/octet-stream',
            session: t.adminSession,
          },
          {},
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    }));
});
