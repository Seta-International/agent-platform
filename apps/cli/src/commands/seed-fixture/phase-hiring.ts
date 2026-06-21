import { faker } from '@faker-js/faker';
import type { SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import {
  addCandidate,
  createRejectionReason,
  listRejectionReasons,
  moveApplicationStage,
  openRequisition,
  rejectApplication,
  setApplicationRating,
} from '@seta/hiring';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import type { SeededSkill } from './phase-skills.ts';

const log = pino({ name: 'cli/seed-fixture/hiring' });

const STAGES = ['new', 'screening', 'interview', 'offer'] as const;
type Stage = (typeof STAGES)[number];

const OPENINGS = [
  {
    role: 'Senior Backend Engineer',
    account: 'Gridbeyond Energy',
    skills: ['Node.js', 'TypeScript', 'PostgreSQL', 'AWS'],
  },
  {
    role: 'QA Automation Engineer',
    account: 'Aeris',
    skills: ['Test Automation', 'Playwright', 'Cypress'],
  },
  {
    role: 'React Developer',
    account: 'Motion Global',
    skills: ['React', 'TypeScript', 'Tailwind CSS'],
  },
  {
    role: 'DevOps Engineer',
    account: 'SETA Internal',
    skills: ['AWS', 'Docker', 'Kubernetes', 'Terraform'],
  },
  {
    role: 'Project Manager',
    account: 'Veritone',
    skills: ['Agile', 'Scrum', 'Jira', 'Stakeholder Management'],
  },
  {
    role: 'UI/UX Designer',
    account: 'Commerce Canal',
    skills: ['Figma', 'UX Research', 'Design Systems'],
  },
];

function resolveSkills(
  names: string[],
  catalog: Map<string, SeededSkill>,
): { skill_id: string; skill_name: string }[] {
  return names
    .map((n) => catalog.get(n.toLowerCase()))
    .filter((s): s is SeededSkill => s !== undefined)
    .map((s) => ({ skill_id: s.id, skill_name: s.name }));
}

async function requisitionExistsByTitle(tenantId: string, title: string): Promise<boolean> {
  const r = await coreDb().execute(
    sql`SELECT 1 FROM hiring.requisition WHERE tenant_id = ${tenantId} AND title = ${title} LIMIT 1`,
  );
  return r.rows.length > 0;
}

export async function seedHiring(
  session: SessionScope,
  accountByName: Map<string, string>,
  catalog: Map<string, SeededSkill>,
): Promise<void> {
  faker.seed(20260522);

  const reasons = await listRejectionReasons(session);
  const reasonId =
    reasons[0]?.id ??
    (
      await createRejectionReason({
        input: { label: 'Not a fit', category: 'rejected_by_us' },
        session,
      })
    ).id;

  for (const o of OPENINGS) {
    const title = `${o.role} — ${o.account}`;

    if (await requisitionExistsByTitle(session.tenant_id, title)) {
      log.info({ title }, 'requisition already exists, skipping');
      continue;
    }

    const account_id = accountByName.get(o.account);
    const reqSkills = resolveSkills(o.skills, catalog);
    const { requisition_id } = await openRequisition({
      title,
      role_title: o.role,
      kind: 'new',
      account_id,
      headcount: 1,
      skills: reqSkills,
      session,
    });
    log.info({ title, requisition_id }, 'opened requisition');

    const candidateCount = faker.number.int({ min: 2, max: 5 });
    for (let i = 0; i < candidateCount; i++) {
      const candidateSkills = faker.helpers.arrayElements(
        reqSkills,
        Math.min(reqSkills.length, faker.number.int({ min: 1, max: 3 })),
      );
      const { application_id } = await addCandidate({
        requisition_id,
        name: faker.person.fullName(),
        source: faker.helpers.arrayElement(['LinkedIn', 'Referral', 'Agency', 'Inbound']),
        seniority: faker.helpers.arrayElement(['junior', 'mid', 'senior']),
        skills: candidateSkills,
        session,
      });

      const targetStage: Stage = faker.helpers.arrayElement(STAGES);
      if (targetStage !== 'new') {
        await moveApplicationStage({ application_id, to: targetStage, session });
      }

      const roll = faker.number.float({ min: 0, max: 1 });
      if (roll < 0.2) {
        await rejectApplication({
          application_id,
          input: { reason_id: reasonId, tags: [] },
          session,
        });
      } else if (roll < 0.7) {
        await setApplicationRating({
          application_id,
          rating: faker.number.int({ min: 2, max: 5 }),
          session,
        });
      }
    }

    log.info({ title, candidates: candidateCount }, 'seeded requisition candidates');
  }

  log.info('phase-hiring done');
}
