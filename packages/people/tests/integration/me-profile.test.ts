import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { person } from '../../src/backend/db/schema.ts';
import {
  getPersonSkills,
  provisionWorker,
  readMyProfile,
  setBio,
  setMySkillLevel,
  setMySkills,
  setPresence,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

// Seed catalog skills under one category (mirrors person-skills.test.ts).
async function seedSkills(pool: Pool, tenantId: string, names: string[]): Promise<void> {
  const catId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.skill_category (id, tenant_id, name) VALUES ($1,$2,$3)`, [
    catId,
    tenantId,
    'Engineering',
  ]);
  for (const name of names) {
    await pool.query(
      `INSERT INTO core.skill (id, tenant_id, category_id, name) VALUES ($1,$2,$3,$4)`,
      [crypto.randomUUID(), tenantId, catId, name],
    );
  }
}

async function linkSelf(workerId: string, userId: string): Promise<void> {
  await peopleDb().update(person).set({ user_id: userId }).where(eq(person.id, workerId));
}

describe('People self-service /me profile', () => {
  it('setMySkills set-diffs (add + remove) and getPersonSkills reflects it', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await seedSkills(pool, t.tenant_id, ['TypeScript', 'Rust', 'Go']);
        const { worker_id } = await provisionWorker({
          full_name: 'Skill Worker',
          start_date: '2026-01-01',
          employment_type: 'full_time',
          session: t.adminSession,
        });
        await linkSelf(worker_id, t.admin_user_id);

        await setMySkills(t.adminSession, { skills: ['TypeScript', 'Rust'] });
        expect(await getPersonSkills(t.adminSession, { user_id: t.admin_user_id })).toEqual([
          'Rust',
          'TypeScript',
        ]);

        // drop Rust, add Go
        await setMySkills(t.adminSession, { skills: ['TypeScript', 'Go'] });
        expect(await getPersonSkills(t.adminSession, { user_id: t.admin_user_id })).toEqual([
          'Go',
          'TypeScript',
        ]);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('setMySkills rejects names not in the catalog', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await seedSkills(pool, t.tenant_id, ['TypeScript']);
        const { worker_id } = await provisionWorker({
          full_name: 'Skill Worker',
          start_date: '2026-01-01',
          employment_type: 'full_time',
          session: t.adminSession,
        });
        await linkSelf(worker_id, t.admin_user_id);

        await expect(
          setMySkills(t.adminSession, { skills: ['TypeScript', 'Cobol'] }),
        ).rejects.toThrow(/Cobol/i);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('setBio writes person.bio and readMyProfile composes presence + skills + bio', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await seedSkills(pool, t.tenant_id, ['TypeScript']);
        const { worker_id } = await provisionWorker({
          full_name: 'Profile Worker',
          start_date: '2026-01-01',
          employment_type: 'full_time',
          session: t.adminSession,
        });
        await linkSelf(worker_id, t.admin_user_id);

        await setPresence(t.adminSession, {
          availability_status: 'busy',
          timezone: 'Asia/Ho_Chi_Minh',
        });
        await setMySkills(t.adminSession, { skills: ['TypeScript'] });
        await setBio(t.adminSession, { bio: '  Builds platforms.  ' });

        const me = await readMyProfile(t.adminSession);
        expect(me.availability_status).toBe('busy');
        expect(me.timezone).toBe('Asia/Ho_Chi_Minh');
        expect(me.skills.map((s) => s.name)).toEqual(['TypeScript']);
        expect(me.skills[0]?.level).toBeNull();
        expect(me.bio).toBe('Builds platforms.');
        expect(me.full_name).toBe('Profile Worker');

        // empty bio clears it
        await setBio(t.adminSession, { bio: '   ' });
        expect((await readMyProfile(t.adminSession)).bio).toBeNull();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('setMySkillLevel rates one of my own skills, reflected in readMyProfile', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await seedSkills(pool, t.tenant_id, ['TypeScript', 'Go']);
        const { worker_id } = await provisionWorker({
          full_name: 'Rating Worker',
          start_date: '2026-01-01',
          employment_type: 'full_time',
          session: t.adminSession,
        });
        await linkSelf(worker_id, t.admin_user_id);
        await setMySkills(t.adminSession, { skills: ['TypeScript', 'Go'] });

        const before = await readMyProfile(t.adminSession);
        const ts = before.skills.find((s) => s.name === 'TypeScript');
        expect(ts?.level).toBeNull();

        await setMySkillLevel(t.adminSession, { skill_id: ts!.id, level: 4 });
        const after = await readMyProfile(t.adminSession);
        expect(after.skills.find((s) => s.name === 'TypeScript')?.level).toBe(4);
        // untouched skill stays unrated
        expect(after.skills.find((s) => s.name === 'Go')?.level).toBeNull();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('readMyProfile returns presence defaults + empty skills when nothing set', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { worker_id } = await provisionWorker({
          full_name: 'Bare Worker',
          start_date: '2026-01-01',
          employment_type: 'full_time',
          session: t.adminSession,
        });
        await linkSelf(worker_id, t.admin_user_id);

        const me = await readMyProfile(t.adminSession);
        expect(me.availability_status).toBe('available');
        expect(me.timezone).toBe('UTC');
        expect(me.skills).toEqual([]);
        expect(me.bio).toBeNull();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
