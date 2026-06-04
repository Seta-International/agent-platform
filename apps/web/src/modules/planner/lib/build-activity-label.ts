import type { GroupActivityItem } from '@seta/planner';

export function buildActivityLabel(item: GroupActivityItem): string {
  const actor = item.actor_display_name ?? 'Someone';
  const target = item.target_title;
  const targetUser = item.target_user_display_name;

  switch (item.event_type) {
    case 'planner.group.member.role-changed': {
      const from = String(item.before_state?.role ?? '?');
      const to = String(item.after_state?.role ?? '?');
      return `${actor} changed ${targetUser ?? 'a member'}'s role from ${from} to ${to}`;
    }
    case 'planner.group.member.added':
      return `${actor} added ${targetUser ?? 'a member'} to the group`;
    case 'planner.group.member.removed':
      return `${actor} removed ${targetUser ?? 'a member'} from the group`;
    case 'planner.task.assigned':
      return `${actor} assigned ${targetUser ?? 'someone'} to "${target ?? 'a task'}"`;
    case 'planner.task.unassigned':
      return `${actor} unassigned ${targetUser ?? 'someone'} from "${target ?? 'a task'}"`;
    case 'planner.group.updated': {
      const fields = item.changed_fields ?? [];
      if (fields.length === 1 && fields[0] === 'name') {
        const from = item.before_state?.name;
        const to = item.after_state?.name;
        return from && to
          ? `${actor} renamed the group from "${from}" to "${to}"`
          : `${actor} renamed the group`;
      }
      return fields.length > 0
        ? `${actor} updated group ${fields.join(', ')}`
        : `${actor} updated the group`;
    }
    case 'planner.task.updated': {
      const fields = item.changed_fields ?? [];
      if (fields.length === 1 && fields[0] === 'title') {
        const from = item.before_state?.title;
        const to = item.after_state?.title;
        return from && to ? `${actor} renamed "${from}" to "${to}"` : `${actor} renamed a task`;
      }
      return fields.length > 0
        ? `${actor} updated ${fields.join(', ')} on "${target ?? 'a task'}"`
        : `${actor} updated "${target ?? 'a task'}"`;
    }
    case 'planner.task.completed':
      return `${actor} completed "${target ?? 'a task'}"`;
    case 'planner.task.reopened':
      return `${actor} reopened "${target ?? 'a task'}"`;
    case 'planner.task.deleted':
      return `${actor} deleted "${target ?? 'a task'}"`;
    case 'planner.task.restored':
      return `${actor} restored "${target ?? 'a task'}"`;
    case 'planner.task.moved':
      return `${actor} moved "${target ?? 'a task'}"`;
    case 'planner.task.created':
      return `${actor} created task "${target ?? 'a task'}"`;
    case 'planner.group.created':
      return `${actor} created group "${target ?? 'a group'}"`;
    case 'planner.plan.created':
      return `${actor} created plan "${target ?? 'a plan'}"`;
    case 'planner.plan.deleted':
      return `${actor} deleted plan "${target ?? 'a plan'}"`;
    case 'planner.bucket.created':
      return `${actor} created bucket "${target ?? 'a bucket'}"`;
    case 'planner.bucket.deleted':
      return `${actor} deleted bucket "${target ?? 'a bucket'}"`;
    default:
      return [actor, item.verb, target].filter(Boolean).join(' ');
  }
}
