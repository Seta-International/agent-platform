/**
 * Isolated mock data for the Team Lead Performance dashboard (SCR-02, TL
 * capacity). Same contract as the AM/member fixtures: the pillar / group axis is
 * REAL (the account's configured `performance_evaluation_group` rows); only the
 * scores and evaluation state are mocked until the scoring API lands.
 *
 * A TL owns one project and evaluates each of its members. The project's pillar
 * scores roll up from those member evaluations.
 */

import {
  meanScores,
  type PerformanceGroupAxis,
  scoresForSubject,
  weightedOverall,
} from './performance-scores.ts';

/** Whether the TL has evaluated a member; `auto_pending` = auto-seeded draft. */
export type TlMemberStatus = 'evaluated' | 'auto_pending';
/** Whether the AM has reviewed this TL. */
export type TlReviewState = 'pending' | 'submitted' | 'not_ready';

export type TlMemberRow = {
  member_id: string;
  name: string;
  role: string;
  scores: Record<string, number>;
  total: number;
  status: TlMemberStatus;
};

export type TlDashboardData = {
  project_id: string;
  project_name: string;
  cycle_label: string;
  groups: readonly PerformanceGroupAxis[];
  team_size: number;
  evaluated_count: number;
  team_avg: number;
  my_review_state: TlReviewState;
  /** group_id → project rollup (mean of member scores). */
  project_scores: Record<string, number>;
  project_overall: number;
  members: readonly TlMemberRow[];
};

const MEMBER_SEEDS: readonly {
  id: string;
  name: string;
  role: string;
  status: TlMemberStatus;
  floor: number;
  bias: number;
}[] = [
  {
    id: 'm1',
    name: 'Tran Thu Ha',
    role: 'Senior Frontend Engineer',
    status: 'evaluated',
    floor: 3.9,
    bias: 0.3,
  },
  {
    id: 'm2',
    name: 'Do Thi Mai',
    role: 'QA Automation Engineer',
    status: 'auto_pending',
    floor: 3.7,
    bias: 0.2,
  },
  {
    id: 'm3',
    name: 'James Carter',
    role: 'Frontend Intern',
    status: 'auto_pending',
    floor: 3.4,
    bias: 0.2,
  },
];

export function tlDashboardFixture(
  groups: readonly PerformanceGroupAxis[],
  projectName: string,
  cycleLabel: string,
): TlDashboardData {
  const members: TlMemberRow[] = MEMBER_SEEDS.map((m) => {
    const scores = scoresForSubject(groups, `${projectName}:${m.id}`, m.floor, m.bias);
    return {
      member_id: m.id,
      name: m.name,
      role: m.role,
      scores,
      total: weightedOverall(groups, scores),
      status: m.status,
    };
  });

  const project_scores = meanScores(groups, members);
  const project_overall = weightedOverall(groups, project_scores);
  const evaluated_count = members.filter((m) => m.status === 'evaluated').length;
  const team_avg =
    members.length === 0
      ? 0
      : Math.round((members.reduce((s, m) => s + m.total, 0) / members.length) * 10) / 10;

  return {
    project_id: 'proj',
    project_name: projectName,
    cycle_label: cycleLabel,
    groups,
    team_size: members.length,
    evaluated_count,
    team_avg,
    my_review_state: 'pending',
    project_scores,
    project_overall,
    members,
  };
}
