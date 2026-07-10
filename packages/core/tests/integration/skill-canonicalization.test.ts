import { scoped } from '@seta/shared-db';
import { describe, expect, it } from 'vitest';
import {
  canonicalizeSkill,
  createSkill,
  createSkillAlias,
  createSkillCategory,
  extractSkillMentions,
  slugifySkill,
} from '../../src/index.ts';
import { buildSkillAdminSession, withCoreTestDb } from '../helpers.ts';

async function seedTenant(pool: import('pg').Pool): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1,$2,$3)`, [
    id,
    'T',
    `t-${id.slice(0, 8)}`,
  ]);
  return id;
}

describe('slugifySkill', () => {
  it('normalizes punctuation, case, and spacing to a comparable slug', () => {
    expect(slugifySkill('React')).toBe('react');
    expect(slugifySkill('React.js')).toBe('reactjs');
    expect(slugifySkill('ReactJS')).toBe('reactjs');
    expect(slugifySkill('React JS')).toBe('reactjs');
    expect(slugifySkill('  reactjs ')).toBe('reactjs');
    expect(slugifySkill('REACT')).toBe('react');
    expect(slugifySkill('Node.js')).toBe('nodejs');
    expect(slugifySkill('nodejs')).toBe('nodejs');
    expect(slugifySkill('C++')).toBe('c');
    // Distinct skills must NOT collapse into the same slug.
    expect(slugifySkill('React Native')).toBe('reactnative');
  });
});

describe('canonicalizeSkill', () => {
  it('resolves a free-text label to the catalog skill via slug and alias', async () => {
    await withCoreTestDb(async ({ pool }) => {
      const tenant = await seedTenant(pool);
      await scoped(tenant, async () => {
        const session = buildSkillAdminSession(tenant);
        const { id: catId } = await createSkillCategory({ input: { name: 'Frontend' }, session });

        const { id: reactId } = await createSkill({
          input: { category_id: catId, name: 'React' },
          session,
        });
        const { id: nodeId } = await createSkill({
          input: { category_id: catId, name: 'Node.js' },
          session,
        });

        // Slug alone unifies "Node.js" (slug nodejs) with the label "nodejs".
        expect((await canonicalizeSkill(session, 'nodejs'))?.skill_id).toBe(nodeId);
        expect((await canonicalizeSkill(session, 'Node.js'))?.skill_id).toBe(nodeId);

        // "reactjs" (slug reactjs) does NOT slug-match "React" (slug react):
        // it needs an alias to resolve.
        expect(await canonicalizeSkill(session, 'reactjs')).toBeNull();

        await createSkillAlias({ input: { skill_id: reactId, alias: 'reactjs' }, session });

        expect((await canonicalizeSkill(session, 'reactjs'))?.skill_id).toBe(reactId);
        // "react.js" slugs to reactjs and resolves through the same alias.
        expect((await canonicalizeSkill(session, 'react.js'))?.skill_id).toBe(reactId);
      });
    });
  });

  it('resolves every React label variant to the same catalog skill (regression)', async () => {
    await withCoreTestDb(async ({ pool }) => {
      const tenant = await seedTenant(pool);
      await scoped(tenant, async () => {
        const session = buildSkillAdminSession(tenant);
        const { id: catId } = await createSkillCategory({ input: { name: 'Frontend' }, session });
        const { id: reactId } = await createSkill({
          input: { category_id: catId, name: 'React' },
          session,
        });
        await createSkillAlias({ input: { skill_id: reactId, alias: 'reactjs' }, session });

        // Casing/punctuation collapse to the skill's own slug (react) or the
        // alias slug (reactjs). Every one must land on the React skill.
        for (const variant of [
          'React',
          'react',
          'REACT',
          'ReactJS',
          'reactjs',
          'react.js',
          'React JS',
          'reactj s',
        ]) {
          expect((await canonicalizeSkill(session, variant))?.skill_id, variant).toBe(reactId);
        }

        // Neighbouring skills must NOT be captured by the React slug/alias.
        expect(await canonicalizeSkill(session, 'React Native')).toBeNull();
        expect(await canonicalizeSkill(session, 'react framework')).toBeNull();
      });
    });
  });

  it('returns null for text that matches no skill or alias', async () => {
    await withCoreTestDb(async ({ pool }) => {
      const tenant = await seedTenant(pool);
      await scoped(tenant, async () => {
        const session = buildSkillAdminSession(tenant);
        const { id: catId } = await createSkillCategory({ input: { name: 'Frontend' }, session });
        await createSkill({ input: { category_id: catId, name: 'React' }, session });

        expect(await canonicalizeSkill(session, 'quantum-basket-weaving')).toBeNull();
        expect(await canonicalizeSkill(session, '   ')).toBeNull();
      });
    });
  });

  it('is tenant-scoped: an alias in one tenant does not resolve in another', async () => {
    await withCoreTestDb(async ({ pool }) => {
      const tenantA = await seedTenant(pool);
      const tenantB = await seedTenant(pool);
      const sessionA = buildSkillAdminSession(tenantA);
      const sessionB = buildSkillAdminSession(tenantB);

      const reactA = await scoped(tenantA, async () => {
        const { id: catA } = await createSkillCategory({
          input: { name: 'Frontend' },
          session: sessionA,
        });
        const { id: reactA } = await createSkill({
          input: { category_id: catA, name: 'React' },
          session: sessionA,
        });
        await createSkillAlias({
          input: { skill_id: reactA, alias: 'reactjs' },
          session: sessionA,
        });
        return reactA;
      });

      await scoped(tenantA, async () => {
        expect((await canonicalizeSkill(sessionA, 'reactjs'))?.skill_id).toBe(reactA);
      });
      await scoped(tenantB, async () => {
        expect(await canonicalizeSkill(sessionB, 'reactjs')).toBeNull();
      });
    });
  });
});

describe('extractSkillMentions', () => {
  it('mines catalog skills from a label-less task title/description', async () => {
    await withCoreTestDb(async ({ pool }) => {
      const tenant = await seedTenant(pool);
      await scoped(tenant, async () => {
        const session = buildSkillAdminSession(tenant);
        const { id: catId } = await createSkillCategory({ input: { name: 'Frontend' }, session });
        const { id: reactId } = await createSkill({
          input: { category_id: catId, name: 'React' },
          session,
        });
        const { id: nodeId } = await createSkill({
          input: { category_id: catId, name: 'Node.js' },
          session,
        });
        await createSkillAlias({ input: { skill_id: reactId, alias: 'reactjs' }, session });

        const found = await extractSkillMentions(
          session,
          'Migrate the ReactJS front-end into a monorepo. Consolidate our ReactJS app and Node.js services into a single monorepo.',
        );
        // "reactjs" resolves through the alias, "Node.js" through its own slug —
        // exactly the label-less prod scenario, with no labels present.
        expect(found.map((s) => s.skill_id).sort()).toEqual([reactId, nodeId].sort());
        // "ReactJS" appears twice but resolves to one distinct skill.
        expect(found.filter((s) => s.skill_id === reactId)).toHaveLength(1);
      });
    });
  });

  it('matches multi-word skills and ignores non-skill prose', async () => {
    await withCoreTestDb(async ({ pool }) => {
      const tenant = await seedTenant(pool);
      await scoped(tenant, async () => {
        const session = buildSkillAdminSession(tenant);
        const { id: catId } = await createSkillCategory({ input: { name: 'Backend' }, session });
        const { id: restId } = await createSkill({
          input: { category_id: catId, name: 'REST APIs' },
          session,
        });

        // A 2-word window ("REST APIs") slugs to "restapis" and resolves.
        expect(
          (
            await extractSkillMentions(session, 'Design and document the REST APIs for billing.')
          ).map((s) => s.skill_id),
        ).toEqual([restId]);
        // Prose with no catalog skill yields nothing.
        expect(
          await extractSkillMentions(session, 'Write the quarterly planning summary.'),
        ).toEqual([]);
      });
    });
  });

  it('skips sub-3-char windows so common words never collide with short skills', async () => {
    await withCoreTestDb(async ({ pool }) => {
      const tenant = await seedTenant(pool);
      await scoped(tenant, async () => {
        const session = buildSkillAdminSession(tenant);
        const { id: catId } = await createSkillCategory({ input: { name: 'Lang' }, session });
        await createSkill({ input: { category_id: catId, name: 'Go' }, session });
        const { id: reactId } = await createSkill({
          input: { category_id: catId, name: 'React' },
          session,
        });

        // "go" (slug length 2) must not match the Go skill from ordinary prose;
        // "React" (>= 3 chars) still resolves.
        expect(
          (
            await extractSkillMentions(session, 'We need to go and finish the React migration.')
          ).map((s) => s.skill_id),
        ).toEqual([reactId]);
      });
    });
  });
});
