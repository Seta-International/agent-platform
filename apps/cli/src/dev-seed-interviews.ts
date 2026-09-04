/**
 * Dev-only: seed the Interviews agenda (FUT-487) with real, business-rule-valid
 * interview records for the applications already seeded by dev-seed-hiring.ts.
 *
 * Goes through the real domain functions (scheduleInterview + complete/cancel/no-show),
 * not raw INSERTs, so the outbox events + candidate activity trail come along for free.
 *
 *   pnpm -F @seta/cli exec tsx src/dev-seed-interviews.ts
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreDb } from '@seta/core/db';
import {
  cancelInterview,
  completeInterview,
  markInterviewNoShow,
  scheduleInterview,
} from '@seta/hiring';
import type { InterviewPanelistInput } from '@seta/hiring/contracts';
import { closePools, initPools } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { buildAdminSession } from './commands/seed.ts';
import { parseEnv } from './env.ts';

const log = pino({ name: 'cli/dev-seed-interviews' });

process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'));
const env = parseEnv(process.env);
initPools({ databaseUrl: env.DATABASE_URL });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';

// Panelists — real identity.user rows in the dev tenant (seeded by tenant-bootstrap.sh /
// seed-fixture), reused as interview panel members so the panel avatars resolve to real people.
const PM_NGA: InterviewPanelistInput = {
  user_id: '14b11991-b8f6-4bf0-8993-631a3c8d0004',
  display_name: 'Đặng Thị Nga',
};
const PM_DAT: InterviewPanelistInput = {
  user_id: 'c5a4cb25-0f07-4bc7-88fe-36b3ae49cdef',
  display_name: 'Phạm Tiến Đạt',
};
const PM_KHOA: InterviewPanelistInput = {
  user_id: 'c2daf4c5-9c85-4c1e-84ed-6f385662b63f',
  display_name: 'Vũ Minh Khoa',
};
const PM_LAN: InterviewPanelistInput = {
  user_id: '45f1232e-3fad-4163-b057-0f441ab36d41',
  display_name: 'Ngô Thị Lan',
};
const PM_MINH: InterviewPanelistInput = {
  user_id: 'd3135195-f269-47fa-8b67-0fa983902c88',
  display_name: 'Bùi Văn Minh',
};
const PM_PHUC: InterviewPanelistInput = {
  user_id: '0e2cdb54-401c-415a-abc5-feb87a68b6a7',
  display_name: 'Trịnh Văn Phúc',
};
const AM_HOA: InterviewPanelistInput = {
  user_id: 'aa5dd53e-f3e7-4042-b8e6-ebe528f70eb1',
  display_name: 'Phan Thị Hoa',
};
const EM_BA: InterviewPanelistInput = {
  user_id: 'b7de2a1d-1df9-40fb-b597-507363a3cbe3',
  display_name: 'Trần Văn Ba',
};
const HAI_LE: InterviewPanelistInput = {
  user_id: '9d380ec2-08b4-43f1-a775-4dc2582d5ae5',
  display_name: 'Hai Le',
};

type Outcome =
  | { kind: 'scheduled' }
  | { kind: 'pass' | 'hold' | 'fail'; feedback_note: string }
  | { kind: 'cancelled' | 'no_show'; reason: string };

interface InterviewSeed {
  label: string; // candidate — requisition, for logs only
  application_id: string;
  scheduled_at: string; // ISO, Asia/Ho_Chi_Minh (+07:00)
  duration_minutes: number;
  mode: 'online' | 'onsite';
  meeting_link?: string;
  note: string;
  panel: InterviewPanelistInput[];
  outcome: Outcome;
}

// 20 interviews against real active applications (queried live from the dev DB — see PR
// notes), spanning today / tomorrow / this week / next week / later, plus a slice of history
// (completed with each result, one cancelled, one no-show) so every agenda bucket + the
// Completed/All tabs have real data to show.
const SEEDS: InterviewSeed[] = [
  {
    label: 'Hobart Casper — Data Engineer — Kertzmann Group',
    application_id: 'f31a74af-e3a7-46f9-9c22-c41ad6096824',
    scheduled_at: '2026-08-12T10:00:00+07:00',
    duration_minutes: 45,
    mode: 'online',
    meeting_link: 'https://meet.google.com/keq-cas-812',
    note: 'Screening — SQL fundamentals and pipeline design walkthrough.',
    panel: [PM_NGA],
    outcome: {
      kind: 'hold',
      feedback_note:
        'Solid fundamentals but light on production pipeline experience — hold for a second data requisition.',
    },
  },
  {
    label: 'Mr. Jon Wuckert — Data Engineer — Kertzmann Group',
    application_id: 'bf65e26a-3cf9-412e-8be9-b03e59413c59',
    scheduled_at: '2026-08-24T09:00:00+07:00',
    duration_minutes: 45,
    mode: 'online',
    meeting_link: 'https://meet.google.com/keq-wuc-824',
    note: 'Screening — SQL fundamentals.',
    panel: [PM_NGA],
    outcome: { kind: 'no_show', reason: 'Candidate did not join; no response to follow-up email.' },
  },
  {
    label: 'Shea Jast — Data Engineer — Kertzmann Group',
    application_id: '2a984e84-7bad-44a9-b897-70ddab710607',
    scheduled_at: '2026-08-28T09:00:00+07:00',
    duration_minutes: 45,
    mode: 'online',
    meeting_link: 'https://meet.google.com/keq-jst-828',
    note: 'Phone screen — data pipeline experience, SQL fundamentals.',
    panel: [PM_NGA],
    outcome: { kind: 'scheduled' },
  },
  {
    label: 'Stephan Turcotte — Data Engineer — Kertzmann Group',
    application_id: 'fcc3454f-4c17-4485-b6a9-b8ee5c2a95f7',
    scheduled_at: '2026-08-20T13:00:00+07:00',
    duration_minutes: 45,
    mode: 'online',
    meeting_link: 'https://meet.google.com/keq-trc-820',
    note: 'Screening — SQL fundamentals.',
    panel: [PM_NGA],
    outcome: {
      kind: 'cancelled',
      reason: 'Hiring manager travel — requisition still open, will re-schedule.',
    },
  },
  {
    label: 'Faith Spinka PhD — Data Engineer — Mosciski Inc',
    application_id: 'f00d10ec-9498-4c81-a8fb-07875bf6d5c7',
    scheduled_at: '2026-09-07T09:00:00+07:00',
    duration_minutes: 60,
    mode: 'online',
    meeting_link: 'https://meet.google.com/mos-spk-907',
    note: 'Technical round — data modeling + pipeline design.',
    panel: [PM_NGA, HAI_LE],
    outcome: { kind: 'scheduled' },
  },
  {
    label: 'Mr. Vida Thiel — Data Engineer — Mosciski Inc',
    application_id: '1b6f4abc-14de-4990-8fd2-14a2d642a0f6',
    scheduled_at: '2026-08-29T10:00:00+07:00',
    duration_minutes: 45,
    mode: 'online',
    meeting_link: 'https://meet.google.com/mos-thl-829',
    note: 'Screening call — candidate requested a weekend slot.',
    panel: [PM_NGA],
    outcome: { kind: 'scheduled' },
  },
  {
    label: 'Hugo Schmitt — Frontend Engineer — Becker - Pagac',
    application_id: '91055a26-69ca-4e87-a323-3c61629b1daf',
    scheduled_at: '2026-08-28T10:30:00+07:00',
    duration_minutes: 60,
    mode: 'onsite',
    note: 'Onsite — SETA HQ, Meeting Room 2. Technical round — React + component architecture.',
    panel: [PM_MINH, AM_HOA],
    outcome: { kind: 'scheduled' },
  },
  {
    label: 'Irene Graham — Frontend Engineer — Becker - Pagac',
    application_id: 'ae9f61e9-646c-42f5-8b00-e7aa7ace394f',
    scheduled_at: '2026-08-31T09:30:00+07:00',
    duration_minutes: 60,
    mode: 'onsite',
    note: 'Onsite — SETA HQ, Meeting Room 2. Technical round — React + component architecture.',
    panel: [PM_MINH, AM_HOA],
    outcome: { kind: 'scheduled' },
  },
  {
    label: 'Lottie Haag II — Frontend Engineer — Becker - Pagac',
    application_id: '2052be50-4c0e-43f0-a146-fd269c2d6434',
    scheduled_at: '2026-08-28T14:00:00+07:00',
    duration_minutes: 60,
    mode: 'online',
    meeting_link: 'https://meet.google.com/bkr-hg-828',
    note: 'Panel round — system design + culture fit.',
    panel: [PM_MINH, EM_BA],
    outcome: { kind: 'scheduled' },
  },
  {
    label: 'Mike Borer — Frontend Engineer — Becker - Pagac',
    application_id: 'c88b49f9-1577-4235-b95f-f06b7503d08f',
    scheduled_at: '2026-08-31T15:00:00+07:00',
    duration_minutes: 45,
    mode: 'online',
    meeting_link: 'https://meet.google.com/bkr-brr-831',
    note: 'Initial screen — portfolio walkthrough.',
    panel: [EM_BA],
    outcome: { kind: 'scheduled' },
  },
  {
    label: 'Ron Runolfsdottir — Frontend Engineer — Becker - Pagac',
    application_id: '49e04b4f-6c36-48e7-b56f-26e2fe113d4e',
    scheduled_at: '2026-08-14T10:00:00+07:00',
    duration_minutes: 60,
    mode: 'online',
    meeting_link: 'https://meet.google.com/bkr-run-814',
    note: 'Final round — system design + culture fit.',
    panel: [PM_MINH, AM_HOA],
    outcome: {
      kind: 'pass',
      feedback_note: 'Strong system design, great communication — advance to offer.',
    },
  },
  {
    label: "Bernice Sauer — Product Manager — Corkery, O'Connell and Padberg",
    application_id: '3573e925-d78a-4447-9d67-3df060db79d3',
    scheduled_at: '2026-08-28T16:00:00+07:00',
    duration_minutes: 60,
    mode: 'online',
    meeting_link: 'https://meet.google.com/crk-sau-828',
    note: 'Final round — stakeholder management case study.',
    panel: [PM_DAT, PM_LAN],
    outcome: { kind: 'scheduled' },
  },
  {
    label: "Beverly Thompson — Product Manager — Corkery, O'Connell and Padberg",
    application_id: '0bdba25f-8ee7-446d-8a93-98e0bec7eddc',
    scheduled_at: '2026-08-18T11:00:00+07:00',
    duration_minutes: 60,
    mode: 'online',
    meeting_link: 'https://meet.google.com/crk-thm-818',
    note: 'Screening — product sense case study.',
    panel: [PM_DAT],
    outcome: {
      kind: 'fail',
      feedback_note:
        'Struggled to structure the case study, weak stakeholder framing — not a fit for this requisition.',
    },
  },
  {
    // Still 'scheduled' with a scheduled_at that's already in the past — nobody logged an
    // outcome. Exercises the agenda's "Needs an outcome" bucket, which none of the other
    // seeds do (every other past interview here was actually completed/cancelled/no-show).
    label: 'Peggie Schinner V — Product Manager — Jaskolski - Gutkowski',
    application_id: 'fb8aaff4-d8ce-45be-a9cb-72bc48cdad1d',
    scheduled_at: '2026-08-26T10:00:00+07:00',
    duration_minutes: 45,
    mode: 'online',
    meeting_link: 'https://meet.google.com/jsk-sch-826',
    note: 'Screening call — prior PM experience review.',
    panel: [PM_KHOA],
    outcome: { kind: 'scheduled' },
  },
  {
    label: "Loraine Moen V — Product Manager — Corkery, O'Connell and Padberg",
    application_id: '28e18ae7-26c7-4a4c-9389-f2d852de2717',
    scheduled_at: '2026-09-01T11:00:00+07:00',
    duration_minutes: 60,
    mode: 'online',
    meeting_link: 'https://meet.google.com/crk-mn-901',
    note: 'Screening — product sense case study.',
    panel: [PM_DAT],
    outcome: { kind: 'scheduled' },
  },
  {
    label: "Mr. Hunter Walsh — Product Manager — Corkery, O'Connell and Padberg",
    application_id: 'f12e2caf-75f3-4321-a67a-a5864802e9a8',
    scheduled_at: '2026-09-02T13:30:00+07:00',
    duration_minutes: 60,
    mode: 'onsite',
    note: 'Onsite — SETA HQ, Meeting Room 1. Panel round — stakeholder management case study.',
    panel: [PM_DAT, PM_LAN],
    outcome: { kind: 'scheduled' },
  },
  {
    label: 'Erica Lockman — Product Manager — Jaskolski - Gutkowski',
    application_id: '74d2d801-dbcc-4fd5-bbdf-6f79667049c8',
    scheduled_at: '2026-09-03T10:00:00+07:00',
    duration_minutes: 45,
    mode: 'online',
    meeting_link: 'https://meet.google.com/jsk-lck-903',
    note: 'Screening call — prior PM experience review.',
    panel: [PM_KHOA],
    outcome: { kind: 'scheduled' },
  },
  {
    label: 'Kobe Reichel — Project Manager — Vantage Bank',
    application_id: '02e4540d-15df-474c-b269-f3a06e036091',
    scheduled_at: '2026-08-19T14:00:00+07:00',
    duration_minutes: 60,
    mode: 'onsite',
    note: 'Onsite — SETA HQ, Meeting Room 1. Final round — delivery leadership case study.',
    panel: [PM_KHOA],
    outcome: {
      kind: 'pass',
      feedback_note: 'Solid delivery track record, panel unanimous — proceed to offer.',
    },
  },
  {
    label: "Annabell O'Hara — QA Automation Engineer",
    application_id: 'a69cdbc1-157d-4049-8260-9f67db4fa0e4',
    scheduled_at: '2026-09-09T11:30:00+07:00',
    duration_minutes: 60,
    mode: 'onsite',
    note: 'Onsite — SETA HQ, Meeting Room 3. Technical round — Playwright/Cypress test design.',
    panel: [PM_PHUC],
    outcome: { kind: 'scheduled' },
  },
  {
    label: 'Mr. Abel Mills MD — QA Automation Engineer',
    application_id: '39f58173-cf27-4ee0-a9b3-c2da922d1346',
    scheduled_at: '2026-08-21T09:30:00+07:00',
    duration_minutes: 60,
    mode: 'online',
    meeting_link: 'https://meet.google.com/qa-mls-821',
    note: 'Final round — automation strategy review.',
    panel: [PM_PHUC],
    outcome: {
      kind: 'pass',
      feedback_note: 'Deep automation expertise, strong hands-on demo — proceed to offer.',
    },
  },
  {
    label: 'Curtis Reichel — React Developer — Davis - VonRueden',
    application_id: 'a0d73983-30c4-4239-869f-f4815732a1ad',
    scheduled_at: '2026-09-11T15:30:00+07:00',
    duration_minutes: 45,
    mode: 'online',
    meeting_link: 'https://meet.google.com/rct-rch-911',
    note: 'Initial screen — React/TypeScript fundamentals.',
    panel: [EM_BA],
    outcome: { kind: 'scheduled' },
  },
];

async function resolveTenantByAdmin(email: string): Promise<string> {
  const r = await coreDb().execute(
    sql`SELECT tenant_id FROM identity."user" WHERE email = ${email} LIMIT 1`,
  );
  const id = (r.rows[0] as { tenant_id?: string } | undefined)?.tenant_id;
  if (!id) throw new Error(`No user ${email} — bootstrap the tenant first (tenant-bootstrap.sh)`);
  return id;
}

async function alreadySeeded(tenantId: string, applicationId: string): Promise<boolean> {
  const r = await coreDb().execute(
    sql`SELECT 1 FROM hiring.interview WHERE tenant_id = ${tenantId} AND application_id = ${applicationId} LIMIT 1`,
  );
  return r.rows.length > 0;
}

async function main(): Promise<void> {
  const tenantId = await resolveTenantByAdmin(ADMIN_EMAIL);
  const session = await buildAdminSession(tenantId, ADMIN_EMAIL);
  log.info({ tenantId, admin: ADMIN_EMAIL, count: SEEDS.length }, 'seeding interviews');

  let created = 0;
  let skipped = 0;
  for (const seed of SEEDS) {
    if (await alreadySeeded(tenantId, seed.application_id)) {
      log.info({ label: seed.label }, 'application already has an interview, skipping');
      skipped++;
      continue;
    }

    const { interview_id, version } = await scheduleInterview({
      application_id: seed.application_id,
      scheduled_at: seed.scheduled_at,
      duration_minutes: seed.duration_minutes,
      mode: seed.mode,
      meeting_link: seed.meeting_link,
      note: seed.note,
      panel: seed.panel,
      session,
    });

    if (
      seed.outcome.kind === 'pass' ||
      seed.outcome.kind === 'hold' ||
      seed.outcome.kind === 'fail'
    ) {
      await completeInterview({
        interview_id,
        expected_version: version,
        input: { result: seed.outcome.kind, feedback_note: seed.outcome.feedback_note },
        session,
      });
    } else if (seed.outcome.kind === 'cancelled') {
      await cancelInterview({
        interview_id,
        expected_version: version,
        input: { outcome_reason: seed.outcome.reason },
        session,
      });
    } else if (seed.outcome.kind === 'no_show') {
      await markInterviewNoShow({
        interview_id,
        expected_version: version,
        input: { outcome_reason: seed.outcome.reason },
        session,
      });
    }

    log.info({ label: seed.label, interview_id, outcome: seed.outcome.kind }, 'seeded interview');
    created++;
  }

  log.info({ created, skipped }, 'dev-seed-interviews done');
}

main()
  .then(() => closePools())
  .then(() => process.exit(0))
  .catch(async (err) => {
    log.error({ err }, 'seed failed');
    await closePools();
    process.exit(1);
  });
