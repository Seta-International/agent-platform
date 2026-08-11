/**
 * Isolated mock data for the strategic Performance dashboard (SCR-02, org tier:
 * PMO / BoD / admin). One level up from the AM view: columns are ACCOUNTS, and
 * drilling an account reveals its PROJECTS (same pillar heatmap shape).
 *
 * Unlike the AM/TL/member dashboards, the org tier spans every account, so there
 * is no single account whose config we can read for the pillar axis — and there
 * is no tenant-groups API yet. The axis here is therefore the tenant DEFAULT
 * pillar template (the same five groups + weights `@seta/people` seeds for a new
 * account). Swap it for a company-rollup API when one lands; everything else
 * (accounts, projects, scores) is deterministic mock, stable per id.
 */

import {
  meanScores,
  type PerformanceGroupAxis,
  scoresForSubject,
  weightedOverall,
} from './performance-scores.ts';

/**
 * Tenant default pillar axis — mirrors PERFORMANCE_GROUP_TEMPLATES in
 * `@seta/people` (backend). Group ids are stable synthetic slugs; scores are
 * keyed by them so the mock stays internally consistent.
 */
export const COMPANY_PILLAR_AXIS: readonly PerformanceGroupAxis[] = [
  { group_id: 'delivery', name: 'Delivery', weight: 20 },
  { group_id: 'ai_adaptation', name: 'AI Adaptation', weight: 20 },
  { group_id: 'technical_excellence', name: 'Technical Excellence', weight: 25 },
  { group_id: 'communication', name: 'Communication', weight: 20 },
  { group_id: 'ownership_professionalism', name: 'Ownership & Professionalism', weight: 15 },
];

/** Whether the account's AM / dept head has been evaluated by the BoD this cycle. */
export type BodReviewStatus = 'evaluated' | 'pending';

export type StrategicProjectRow = {
  project_id: string;
  project_name: string;
  team_lead_name: string;
  member_count: number;
  /** group_id → project pillar average. */
  scores: Record<string, number>;
  overall: number;
};

export type AccountDrill = {
  account_id: string;
  account_name: string;
  am_name: string;
  project_count: number;
  member_count: number;
  bod_review: BodReviewStatus;
  /** group_id → account pillar average (mean across its projects). */
  scores: Record<string, number>;
  overall: number;
  projects: StrategicProjectRow[];
};

export type StrategicKpis = {
  am_to_review: number;
  am_evaluated: number;
  accounts: number;
  people_in_delivery: number;
  company_avg: number;
  cycle_label: string;
};

export type StrategicDashboardData = {
  groups: readonly PerformanceGroupAxis[];
  kpis: StrategicKpis;
  accounts: readonly AccountDrill[];
};

type ProjectSeed = { id: string; name: string; tl: string; people: number };
type AccountSeed = {
  id: string;
  name: string;
  am: string;
  people: number;
  bod: BodReviewStatus;
  floor: number;
  bias: number;
  projects: ProjectSeed[];
};

const ACCOUNT_SEEDS: readonly AccountSeed[] = [
  {
    id: 'vinfast',
    name: 'Vinfast',
    am: 'Le Quang Huy',
    people: 7,
    bod: 'pending',
    floor: 3.3,
    bias: 0,
    projects: [
      { id: 'vinfast:cva', name: 'Connected Vehicle App', tl: 'Pham Quoc Bao', people: 4 },
      { id: 'vinfast:dealer', name: 'Dealer Portal', tl: 'Daniel Okafor', people: 2 },
    ],
  },
  {
    id: 'maybank',
    name: 'Maybank',
    am: 'Nurul Aisyah',
    people: 3,
    bod: 'pending',
    floor: 2.9,
    bias: 0,
    projects: [{ id: 'maybank:rba', name: 'Retail Banking App', tl: 'Farid Rahman', people: 3 }],
  },
  {
    id: 'globex',
    name: 'Globex Retail',
    am: 'Maria Alvarez',
    people: 3,
    bod: 'pending',
    floor: 3.4,
    bias: 0,
    projects: [{ id: 'globex:inv', name: 'Inventory Platform', tl: 'Ivan Petrov', people: 3 }],
  },
  {
    id: 'avia',
    name: 'AVIA',
    am: 'Thomas Berg',
    people: 5,
    bod: 'pending',
    floor: 2.7,
    bias: 0,
    projects: [{ id: 'avia:ops', name: 'Flight Ops Portal', tl: 'Sofia Ruiz', people: 5 }],
  },
  {
    id: 'aeris',
    name: 'Aeris',
    am: 'Kenji Watanabe',
    people: 6,
    bod: 'pending',
    floor: 2.8,
    bias: 0,
    projects: [
      { id: 'aeris:grid', name: 'Weather Grid', tl: 'Anh Tuan', people: 3 },
      { id: 'aeris:mesh', name: 'Sensor Mesh', tl: 'Grace Lim', people: 3 },
    ],
  },
  {
    id: 'ai_rnd',
    name: 'AI R&D',
    am: 'Elena Popescu',
    people: 3,
    bod: 'pending',
    floor: 3.3,
    bias: 0.05,
    projects: [{ id: 'ai_rnd:lab', name: 'Model Lab', tl: 'Hoang Long', people: 3 }],
  },
];

/** Builds the org-tier dashboard fixture around the tenant default pillar axis. */
export function strategicDashboardFixture(cycleLabel: string): StrategicDashboardData {
  const axis = COMPANY_PILLAR_AXIS;
  const accounts: AccountDrill[] = ACCOUNT_SEEDS.map((a) => {
    const projects: StrategicProjectRow[] = a.projects.map((p) => {
      const scores = scoresForSubject(axis, p.id, a.floor, a.bias);
      return {
        project_id: p.id,
        project_name: p.name,
        team_lead_name: p.tl,
        member_count: p.people,
        scores,
        overall: weightedOverall(axis, scores),
      };
    });
    const scores = meanScores(axis, projects);
    return {
      account_id: a.id,
      account_name: a.name,
      am_name: a.am,
      project_count: a.projects.length,
      member_count: a.people,
      bod_review: a.bod,
      scores,
      overall: weightedOverall(axis, scores),
      projects,
    };
  });

  const companyAvg =
    accounts.length === 0
      ? 0
      : Math.round((accounts.reduce((s, a) => s + a.overall, 0) / accounts.length) * 10) / 10;

  return {
    groups: axis,
    kpis: {
      am_to_review: accounts.filter((a) => a.bod_review === 'pending').length,
      am_evaluated: accounts.filter((a) => a.bod_review === 'evaluated').length,
      accounts: accounts.length,
      people_in_delivery: accounts.reduce((s, a) => s + a.member_count, 0),
      company_avg: companyAvg,
      cycle_label: cycleLabel,
    },
    accounts,
  };
}
