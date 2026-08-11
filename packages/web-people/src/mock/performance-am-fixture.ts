/**
 * Isolated mock data for the AM Performance dashboard (SCR-02, AM capacity).
 *
 * The pillar / group axis is REAL (see performance-scores → PerformanceGroupAxis;
 * comes from GET /performance/accounts/:id/config). Everything project-shaped
 * (projects, their team lead, their members, the scores) is mocked — there is no
 * scoring / evaluate-TL backend yet. Scores are deterministic per member id so
 * they stay stable across renders. Swapping in a real API later is a drop-in.
 */

import {
  meanScores,
  type PerformanceGroupAxis,
  scoresForSubject,
  weightedOverall,
} from './performance-scores.ts';

/** Whether the account's TL evaluation for a project is done. */
export type EvaluationStatus = 'evaluated' | 'pending';
/** Whether the TL has reviewed a member this cycle. */
export type ReviewStatus = 'reviewed' | 'pending' | 'locked';

export type MemberRow = {
  member_id: string;
  name: string;
  role: string;
  /** The project's Team Lead / EM — the person the AM evaluates. */
  is_team_lead: boolean;
  scores: Record<string, number>;
  total: number;
  /** Member: has the TL reviewed them. Team Lead: unused (see eval_status). */
  review_status: ReviewStatus;
  /** Team Lead only: has the AM evaluated them. */
  eval_status: EvaluationStatus;
};

export type ProjectDrill = {
  project_id: string;
  project_name: string;
  team_lead_name: string;
  member_count: number;
  /** group_id → project pillar average (mean across its members). */
  scores: Record<string, number>;
  overall: number;
  members: MemberRow[];
};

export type AmDashboardKpis = {
  team_leads_to_review: number;
  team_leads_total: number;
  projects: number;
  account_avg: number;
  cycle_label: string;
};

export type AmDashboardData = {
  account_label: string;
  groups: readonly PerformanceGroupAxis[];
  kpis: AmDashboardKpis;
  projects: readonly ProjectDrill[];
};

type MemberSeed = { name: string; role: string; review: ReviewStatus };
type ProjectSeed = {
  id: string;
  name: string;
  tl: { name: string; role: string; eval: EvaluationStatus };
  members: MemberSeed[];
  floor: number;
  bias: number;
};

const PROJECT_SEEDS: readonly ProjectSeed[] = [
  {
    id: 'cva',
    name: 'Connected Vehicle App',
    tl: { name: 'Pham Quoc Bao', role: 'Team Lead', eval: 'evaluated' },
    members: [
      { name: 'Tran Minh Anh', role: 'Frontend Engineer', review: 'reviewed' },
      { name: 'Sara Okonkwo', role: 'Backend Engineer', review: 'reviewed' },
      { name: 'Le Hoang Nam', role: 'QA Engineer', review: 'pending' },
    ],
    floor: 3.7,
    bias: 0.3,
  },
  {
    id: 'dealer',
    name: 'Dealer Portal',
    tl: { name: 'Daniel Okafor', role: 'Engagement Manager (EM)', eval: 'evaluated' },
    members: [{ name: 'Nguyen Trung Hieu', role: 'Backend Engineer', review: 'reviewed' }],
    floor: 3.8,
    bias: 0.3,
  },
  {
    id: 'fleet',
    name: 'Fleet Analytics',
    tl: { name: 'Le Thi Mai', role: 'Team Lead', eval: 'pending' },
    members: [
      { name: 'Diego Santos', role: 'Data Engineer', review: 'reviewed' },
      { name: 'Priya Raman', role: 'Senior Engineer', review: 'pending' },
    ],
    floor: 3.0,
    bias: 0.1,
  },
  {
    id: 'battery',
    name: 'Battery Telemetry',
    tl: { name: 'Tom Becker', role: 'Team Lead', eval: 'pending' },
    members: [
      { name: 'Liam Walsh', role: 'Firmware Engineer', review: 'locked' },
      { name: 'Mai Nguyen', role: 'Engineer', review: 'reviewed' },
    ],
    floor: 2.4,
    bias: -0.1,
  },
];

/**
 * Builds the AM dashboard fixture around the account's real configured groups.
 * `groups` comes straight from the config API; everything else is mock.
 */
export function amDashboardFixture(
  groups: readonly PerformanceGroupAxis[],
  accountLabel: string,
  cycleLabel: string,
): AmDashboardData {
  const projects: ProjectDrill[] = PROJECT_SEEDS.map((p) => {
    // The Team Lead is the first member row — the person the AM evaluates.
    const tl: MemberRow = {
      member_id: `${p.id}:tl`,
      name: p.tl.name,
      role: p.tl.role,
      is_team_lead: true,
      scores: scoresForSubject(groups, `${p.id}:tl`, p.floor, p.bias),
      total: 0,
      review_status: 'reviewed',
      eval_status: p.tl.eval,
    };
    tl.total = weightedOverall(groups, tl.scores);

    const rest: MemberRow[] = p.members.map((m, i) => {
      const scores = scoresForSubject(groups, `${p.id}:m${i}`, p.floor, p.bias);
      return {
        member_id: `${p.id}:m${i}`,
        name: m.name,
        role: m.role,
        is_team_lead: false,
        scores,
        total: weightedOverall(groups, scores),
        review_status: m.review,
        eval_status: 'evaluated',
      };
    });

    const members = [tl, ...rest];
    const scores = meanScores(groups, members);
    return {
      project_id: p.id,
      project_name: p.name,
      team_lead_name: p.tl.name,
      member_count: members.length,
      scores,
      overall: weightedOverall(groups, scores),
      members,
    };
  });

  const accountAvg =
    projects.length === 0
      ? 0
      : Math.round((projects.reduce((s, p) => s + p.overall, 0) / projects.length) * 10) / 10;
  const toReview = projects.filter(
    (p) => p.members.find((m) => m.is_team_lead)?.eval_status === 'pending',
  ).length;

  return {
    account_label: accountLabel,
    groups,
    kpis: {
      team_leads_to_review: toReview,
      team_leads_total: projects.length,
      projects: projects.length,
      account_avg: accountAvg,
      cycle_label: cycleLabel,
    },
    projects,
  };
}
