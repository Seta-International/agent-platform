// packages/planner/tests/integration/golden-dataset-smoke.test.ts
import { describe, expect, it, vi } from 'vitest';
import * as C from '../fixtures/golden/constants.ts';
import { cleanGoldenDataset, seedGoldenDataset } from '../fixtures/golden/index.ts';
import { withAgentTestDb } from './agent-tools-helpers.ts';

describe('golden dataset smoke', () => {
  it('seeds the full golden dataset with correct shape and testcase-specific data', async () => {
    await withAgentTestDb(async ({ pool }) => {
      // Defensive: in case of leftover state from a prior interrupted run.
      await cleanGoldenDataset(pool);
      await seedGoldenDataset(pool);

      // --- Entity counts ---
      const tenant = await pool.query(`SELECT name FROM core.tenants WHERE id = $1`, [C.TENANT_ID]);
      expect(tenant.rows[0]?.name).toBe('SETA International');

      const personCount = await pool.query(
        `SELECT count(*)::int AS c FROM people.person WHERE tenant_id = $1`,
        [C.TENANT_ID],
      );
      expect(personCount.rows[0].c).toBe(50);

      const assigneeProjectionCount = await pool.query(
        `SELECT count(*)::int AS c FROM planner.assignee_projection WHERE tenant_id = $1`,
        [C.TENANT_ID],
      );
      expect(assigneeProjectionCount.rows[0].c).toBe(50);

      const groupsCount = await pool.query(
        `SELECT count(*)::int AS c FROM planner.groups WHERE tenant_id = $1`,
        [C.TENANT_ID],
      );
      expect(groupsCount.rows[0].c).toBe(4);

      const plansCount = await pool.query(
        `SELECT count(*)::int AS c FROM planner.plans WHERE tenant_id = $1`,
        [C.TENANT_ID],
      );
      expect(plansCount.rows[0].c).toBe(8);

      const tasksCount = await pool.query(
        `SELECT count(*)::int AS c FROM planner.tasks WHERE tenant_id = $1`,
        [C.TENANT_ID],
      );
      expect(tasksCount.rows[0].c).toBeGreaterThanOrEqual(195);
      expect(tasksCount.rows[0].c).toBeLessThanOrEqual(210);

      const commentsCount = await pool.query(
        `SELECT count(*)::int AS c FROM planner.task_comments WHERE tenant_id = $1`,
        [C.TENANT_ID],
      );
      expect(commentsCount.rows[0].c).toBeGreaterThanOrEqual(55);
      expect(commentsCount.rows[0].c).toBeLessThanOrEqual(70);

      const eventsCount = await pool.query(
        `SELECT count(*)::int AS c FROM core.events WHERE tenant_id = $1`,
        [C.TENANT_ID],
      );
      expect(eventsCount.rows[0].c).toBeGreaterThanOrEqual(400);

      // --- Testcase-specific assertions ---

      // PQ-001: at least 8 Alpha tasks due this week
      const pq001 = await pool.query(
        `SELECT count(*)::int AS c FROM planner.tasks
          WHERE tenant_id = $1 AND plan_id = $2 AND due_at >= $3 AND due_at <= $4`,
        [C.TENANT_ID, C.PLAN_ALPHA_ID, C.startOfWeek(), C.endOfWeek()],
      );
      expect(pq001.rows[0].c).toBeGreaterThanOrEqual(8);

      // PQ-003: actor has exactly 8 open tasks
      const pq003Open = await pool.query(
        `SELECT count(*)::int AS c FROM planner.tasks t
          JOIN planner.task_assignments a ON a.task_id = t.id
          WHERE t.tenant_id = $1 AND a.user_id = $2 AND t.progress != 'done'`,
        [C.TENANT_ID, C.ACTOR_USER_ID],
      );
      expect(pq003Open.rows[0].c).toBe(8);

      // PQ-003: actor has exactly 6 done tasks
      const pq003Done = await pool.query(
        `SELECT count(*)::int AS c FROM planner.tasks t
          JOIN planner.task_assignments a ON a.task_id = t.id
          WHERE t.tenant_id = $1 AND a.user_id = $2 AND t.progress = 'done'`,
        [C.TENANT_ID, C.ACTOR_USER_ID],
      );
      expect(pq003Done.rows[0].c).toBe(6);

      // PQ-004: Sprint 12 bucket distribution
      const pq004 = await pool.query(
        `SELECT b.name, count(*)::int AS c FROM planner.tasks t
          JOIN planner.buckets b ON b.id = t.bucket_id
          WHERE t.tenant_id = $1 AND t.plan_id = $2 GROUP BY b.name`,
        [C.TENANT_ID, C.PLAN_SPRINT12_ID],
      );
      const bucketCounts = Object.fromEntries(
        pq004.rows.map((r: { name: string; c: number }) => [r.name, r.c]),
      );
      expect(bucketCounts).toEqual({
        'To Do': 8,
        'In Progress': 5,
        Review: 4,
        Done: 8,
      });

      // PQ-005: Alpha has 27 done tasks
      const pq005Done = await pool.query(
        `SELECT count(*)::int AS c FROM planner.tasks
          WHERE tenant_id = $1 AND plan_id = $2 AND progress = 'done'`,
        [C.TENANT_ID, C.PLAN_ALPHA_ID],
      );
      expect(pq005Done.rows[0].c).toBe(27);

      // PQ-005: Alpha has 3 overdue tasks (overdue is relative to the frozen anchor,
      // not wall-clock NOW() — the fixtures are anchored to REFERENCE_TIME).
      const pq005Overdue = await pool.query(
        `SELECT count(*)::int AS c FROM planner.tasks
          WHERE tenant_id = $1 AND plan_id = $2 AND due_at < $3 AND progress != 'done'`,
        [C.TENANT_ID, C.PLAN_ALPHA_ID, C.REFERENCE_TIME],
      );
      expect(pq005Overdue.rows[0].c).toBe(3);

      // PQ-009: billing schema task has 3 comments
      const pq009 = await pool.query(
        `SELECT count(*)::int AS c FROM planner.task_comments
          WHERE tenant_id = $1 AND task_id = $2`,
        [C.TENANT_ID, C.TASK_BILLING_SCHEMA_ID],
      );
      expect(pq009.rows[0].c).toBe(3);

      // PQ-010: API Rate Limit Fix has activity events (matching listTaskEvents' aggregate rule)
      const pq010 = await pool.query(
        `SELECT count(*)::int AS c FROM core.events
          WHERE tenant_id = $1 AND (
            (aggregate_type = 'planner.task' AND aggregate_id = $2)
            OR (aggregate_type IN ('planner.comment', 'planner.label') AND payload->>'task_id' = $2)
          )`,
        [C.TENANT_ID, C.TASK_API_RATE_LIMIT_ID],
      );
      expect(pq010.rows[0].c).toBe(6);

      // PQ-013: Tuan has 12 open tasks in Engineering
      const pq013 = await pool.query(
        `SELECT count(*)::int AS c FROM planner.tasks t
          JOIN planner.task_assignments a ON a.task_id = t.id
          JOIN planner.plans p ON p.id = t.plan_id
          JOIN planner.groups g ON g.id = p.group_id
          JOIN planner.group_members gm ON gm.group_id = g.id AND gm.user_id = a.user_id
          WHERE t.tenant_id = $1 AND a.user_id = $2 AND t.progress != 'done' AND gm.group_id = $3`,
        [C.TENANT_ID, C.USER_TUAN_ID, C.GRP_ENG_ID],
      );
      expect(pq013.rows[0].c).toBe(12);

      // PQ-017: Tuan has recent activity (last 7 days relative to the frozen anchor).
      const pq017 = await pool.query(
        `SELECT count(*)::int AS c FROM core.events
          WHERE tenant_id = $1 AND caused_by_user_id = $2 AND occurred_at >= $3::timestamptz - INTERVAL '7 days'`,
        [C.TENANT_ID, C.USER_TUAN_ID, C.REFERENCE_TIME],
      );
      expect(pq017.rows[0].c).toBeGreaterThanOrEqual(7);

      // PQ-021: at least 3 Nguyens in assignee_projection
      const pq021 = await pool.query(
        `SELECT count(*)::int AS c FROM planner.assignee_projection
          WHERE tenant_id = $1 AND display_name ILIKE '%Nguyen%'`,
        [C.TENANT_ID],
      );
      expect(pq021.rows[0].c).toBeGreaterThanOrEqual(3);

      // PQ-022: at least 4 migration tasks
      const pq022 = await pool.query(
        `SELECT count(*)::int AS c FROM planner.tasks
          WHERE tenant_id = $1 AND title ILIKE '%migration%'`,
        [C.TENANT_ID],
      );
      expect(pq022.rows[0].c).toBeGreaterThanOrEqual(4);

      // PQ-024: no Haskell skill
      const pq024 = await pool.query(
        `SELECT count(*)::int AS c FROM people.person_skill
          WHERE tenant_id = $1 AND skill_name ILIKE 'Haskell'`,
        [C.TENANT_ID],
      );
      expect(pq024.rows[0].c).toBe(0);

      // PQ-026: actor belongs to 3 groups
      const pq026 = await pool.query(
        `SELECT count(*)::int AS c FROM planner.group_members
          WHERE tenant_id = $1 AND user_id = $2`,
        [C.TENANT_ID, C.ACTOR_USER_ID],
      );
      expect(pq026.rows[0].c).toBe(3);

      // PQ-031: actor NOT in marketing
      const pq031 = await pool.query(
        `SELECT count(*)::int AS c FROM planner.group_members
          WHERE tenant_id = $1 AND user_id = $2 AND group_id = $3`,
        [C.TENANT_ID, C.ACTOR_USER_ID, C.GRP_MKT_ID],
      );
      expect(pq031.rows[0].c).toBe(0);

      // Skill catalog has 33 skills (Frontend 8 + Backend 8 + Data 5 + DevOps 7 + Other 5)
      const skillCatalog = await pool.query(
        `SELECT count(*)::int AS c FROM core.skill WHERE tenant_id = $1`,
        [C.TENANT_ID],
      );
      expect(skillCatalog.rows[0].c).toBe(33);

      // Cross-module link: user_projection -> person_skill works, Tuan has TypeScript/Go/Docker
      const tuanSkills = await pool.query(
        `SELECT ps.skill_name FROM people.person_skill ps
          JOIN people.user_projection up ON up.person_id = ps.person_id
          WHERE up.tenant_id = $1 AND up.user_id = $2`,
        [C.TENANT_ID, C.USER_TUAN_ID],
      );
      const tuanSkillNames = tuanSkills.rows.map((r: { skill_name: string }) => r.skill_name);
      expect(tuanSkillNames).toEqual(expect.arrayContaining(['TypeScript', 'Go', 'Docker']));

      await cleanGoldenDataset(pool);
    });
  });

  it('due-this-week result is identical under different wall clocks', async () => {
    await withAgentTestDb(async ({ pool }) => {
      await cleanGoldenDataset(pool);
      await seedGoldenDataset(pool);

      // Capture the anchored week window under two very different system clocks.
      // Timers are faked only around the synchronous window computation and
      // restored before any DB await, so the pg driver is never touched.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
      const w1 = { start: C.startOfWeek(), end: C.endOfWeek() };
      vi.setSystemTime(new Date('2031-01-01T00:00:00Z'));
      const w2 = { start: C.startOfWeek(), end: C.endOfWeek() };
      vi.useRealTimers();

      // The frozen anchor makes the window itself wall-clock independent.
      expect(w1.start.getTime()).toBe(w2.start.getTime());
      expect(w1.end.getTime()).toBe(w2.end.getTime());

      // …and the seeded data resolves to the same due-this-week task set for either window.
      const dueThisWeek = async (win: { start: Date; end: Date }): Promise<string[]> => {
        const r = await pool.query(
          `SELECT id FROM planner.tasks
            WHERE tenant_id = $1 AND plan_id = $2 AND due_at >= $3 AND due_at < $4`,
          [C.TENANT_ID, C.PLAN_ALPHA_ID, win.start, win.end],
        );
        return r.rows.map((x: { id: string }) => x.id);
      };
      const a = await dueThisWeek(w1);
      const b = await dueThisWeek(w2);
      expect(new Set(a)).toEqual(new Set(b));

      await cleanGoldenDataset(pool);
    });
  });
});
