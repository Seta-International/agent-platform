/**
 * Default evaluation groups + criteria for a new account config (FUT-778).
 * Group names/count are fixed; AM only changes weights and criteria within groups.
 */

export type PerformanceCriterionTemplate = {
  name: string;
  weight: number;
  sort: number;
};

export type PerformanceGroupTemplate = {
  code: string;
  name: string;
  sort: number;
  weight: number;
  criteria: readonly PerformanceCriterionTemplate[];
};

export const PERFORMANCE_GROUP_TEMPLATES: readonly PerformanceGroupTemplate[] = [
  {
    code: 'delivery',
    name: 'Delivery',
    sort: 0,
    weight: 20,
    criteria: [
      { name: 'Throughput & velocity', weight: 10, sort: 0 },
      { name: 'Commitment reliability (on-time)', weight: 10, sort: 1 },
    ],
  },
  {
    code: 'ai_adaptation',
    name: 'AI Adaptation',
    sort: 1,
    weight: 20,
    criteria: [
      { name: 'AI workflow integration', weight: 10, sort: 0 },
      { name: 'AI judgment & validation', weight: 10, sort: 1 },
    ],
  },
  {
    code: 'technical_excellence',
    name: 'Technical Excellence',
    sort: 2,
    weight: 25,
    criteria: [
      { name: 'Hard skill for role', weight: 7, sort: 0 },
      { name: 'Defect prevention & verification', weight: 6, sort: 1 },
      { name: 'Requirement & impact analysis', weight: 6, sort: 2 },
      { name: 'PR quality & release safety', weight: 6, sort: 3 },
    ],
  },
  {
    code: 'communication',
    name: 'Communication',
    sort: 3,
    weight: 20,
    criteria: [
      { name: 'Responsiveness / No surprises', weight: 8, sort: 0 },
      { name: 'Daily report / standup', weight: 6, sort: 1 },
      { name: 'English / working language', weight: 6, sort: 2 },
    ],
  },
  {
    code: 'ownership_professionalism',
    name: 'Ownership & Professionalism',
    sort: 4,
    weight: 15,
    criteria: [
      { name: 'Accountability', weight: 5, sort: 0 },
      { name: 'Active initiative', weight: 4, sort: 1 },
      { name: 'Discipline & compliance', weight: 3, sort: 2 },
      { name: 'Documentation', weight: 3, sort: 3 },
    ],
  },
] as const;
