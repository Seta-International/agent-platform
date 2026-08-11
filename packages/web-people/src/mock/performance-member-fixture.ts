/**
 * Isolated mock data for the member Performance dashboard (SCR-02, member
 * capacity). Same contract as the AM fixture: the pillar / group axis is REAL
 * (from the account's configured `performance_evaluation_group` rows), only the
 * scores and review text are mocked until the scoring API lands.
 *
 * A member can be allocated to several projects; each project's lead scores them
 * on the same group set. `my_score` and the written review come from the primary
 * lead's consolidated review for the cycle.
 */

import {
  type PerformanceGroupAxis,
  scoresForSubject,
  weightedOverall,
} from './performance-scores.ts';

export type SelfAssessmentStatus = 'not_started' | 'in_progress' | 'submitted';
export type MemberReviewState = 'submitted' | 'pending' | 'not_ready' | 'locked';

export type MemberProjectScore = {
  project_id: string;
  project_name: string;
  /** e.g. "EM Daniel Okafor" — the lead who scored this project. */
  lead_label: string;
  /** Allocation on this project, whole percent. */
  alloc_pct: number;
  scores: Record<string, number>;
  total: number;
};

export type MemberReview = {
  /** e.g. "Pham Quoc Bao (TL)" — the reviewing lead. */
  lead_label: string;
  status: MemberReviewState;
  overall: number;
  pillars: Record<string, number>;
  strengths: string;
  improve: string;
  focus: string;
  acknowledged: boolean;
};

export type MemberDashboardData = {
  member_label: string;
  cycle_label: string;
  groups: readonly PerformanceGroupAxis[];
  my_score: number | null;
  self_assessment: SelfAssessmentStatus;
  review_state: MemberReviewState;
  by_project: readonly MemberProjectScore[];
  review: MemberReview | null;
};

const PROJECT_SEEDS: readonly {
  id: string;
  name: string;
  lead_label: string;
  alloc_pct: number;
  floor: number;
  bias: number;
}[] = [
  {
    id: 'dealer',
    name: 'Dealer Portal',
    lead_label: 'EM Daniel Okafor',
    alloc_pct: 80,
    floor: 3.8,
    bias: 0.3,
  },
  {
    id: 'cva',
    name: 'Connected Vehicle App',
    lead_label: 'EM Pham Quoc Bao',
    alloc_pct: 20,
    floor: 3.9,
    bias: 0.3,
  },
];

export function memberDashboardFixture(
  groups: readonly PerformanceGroupAxis[],
  memberLabel: string,
  cycleLabel: string,
): MemberDashboardData {
  const by_project: MemberProjectScore[] = PROJECT_SEEDS.map((p) => {
    const scores = scoresForSubject(groups, `${memberLabel}:${p.id}`, p.floor, p.bias);
    return {
      project_id: p.id,
      project_name: p.name,
      lead_label: p.lead_label,
      alloc_pct: p.alloc_pct,
      scores,
      total: weightedOverall(groups, scores),
    };
  });

  // The primary lead (highest allocation) writes the consolidated review.
  const primary = [...PROJECT_SEEDS].sort((a, b) => b.alloc_pct - a.alloc_pct)[0];
  const reviewPillars = scoresForSubject(groups, `${memberLabel}:review`, 3.9, 0.3);
  const overall = weightedOverall(groups, reviewPillars);
  const review: MemberReview = {
    lead_label: `${(primary?.lead_label ?? 'EM Lead').replace(/^EM\s+/, '')} (TL)`,
    status: 'submitted',
    overall,
    pillars: reviewPillars,
    strengths:
      'Drives team architecture decisions; runs effective code reviews; mentors 2 juniors.',
    improve:
      'English fluency in client calls — target B2 → C1. Top performer — start succession planning.',
    focus:
      'Action #28 (English): 30 min/day Business English; identify 1 backup for owned modules.',
    acknowledged: false,
  };

  return {
    member_label: memberLabel,
    cycle_label: cycleLabel,
    groups,
    my_score: overall,
    self_assessment: 'not_started',
    review_state: 'submitted',
    by_project,
    review,
  };
}
