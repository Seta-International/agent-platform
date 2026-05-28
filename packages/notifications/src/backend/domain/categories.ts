export interface NotificationCategory {
  event_type: string;
  label: string;
  default_in_app: boolean;
  default_email: boolean;
  email_available: boolean;
}

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  {
    event_type: 'planner.task.assigned',
    label: 'Task assigned',
    default_in_app: true,
    default_email: false,
    email_available: false,
  },
  {
    event_type: 'planner.task.unassigned',
    label: 'Task unassigned',
    default_in_app: true,
    default_email: false,
    email_available: false,
  },
  {
    event_type: 'planner.task.completed',
    label: 'Task completed',
    default_in_app: true,
    default_email: false,
    email_available: false,
  },
  {
    event_type: 'planner.task.reopened',
    label: 'Task reopened',
    default_in_app: true,
    default_email: false,
    email_available: false,
  },
  {
    event_type: 'planner.group.member.added',
    label: 'Added to group',
    default_in_app: true,
    default_email: false,
    email_available: false,
  },
  {
    event_type: 'planner.group.member.role-changed',
    label: 'Group role changed',
    default_in_app: true,
    default_email: false,
    email_available: false,
  },
  {
    event_type: 'planner.plan.created',
    label: 'Plan created',
    default_in_app: true,
    default_email: false,
    email_available: false,
  },
  {
    event_type: 'planner.plan.deleted',
    label: 'Plan deleted',
    default_in_app: true,
    default_email: false,
    email_available: false,
  },
  {
    event_type: 'agent.workflow.approval.requested',
    label: 'Workflow approval needed',
    default_in_app: true,
    default_email: false,
    email_available: false,
  },
] as const;

export function findCategory(eventType: string): NotificationCategory | undefined {
  return NOTIFICATION_CATEGORIES.find((c) => c.event_type === eventType);
}
