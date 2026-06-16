export type ChartId =
  | 'status'
  | 'priority'
  | 'bucket'
  | 'members'
  | 'completion'
  | 'burndown'
  | 'workload';

export interface ChartDef {
  id: ChartId;
  title: string;
  subtitle: string;
  default: boolean;
  /** Stage 2 time-series charts render disabled in Customize. */
  disabled?: boolean;
}

export const CHART_REGISTRY: ChartDef[] = [
  { id: 'status', title: 'Status', subtitle: 'Task status distribution', default: true },
  { id: 'priority', title: 'Priority', subtitle: 'Priority distribution', default: true },
  { id: 'bucket', title: 'Bucket', subtitle: 'Bucket distribution', default: true },
  { id: 'members', title: 'Members', subtitle: 'Assignment distribution', default: true },
  {
    id: 'completion',
    title: 'Completion',
    subtitle: 'Task completion trend',
    default: false,
    disabled: true,
  },
  {
    id: 'burndown',
    title: 'Burndown',
    subtitle: 'Sprint burndown · Jira',
    default: false,
    disabled: true,
  },
  { id: 'workload', title: 'Team workload', subtitle: 'Capacity by member', default: false },
];

export const DEFAULT_VISIBLE: ChartId[] = CHART_REGISTRY.filter((c) => c.default).map((c) => c.id);
