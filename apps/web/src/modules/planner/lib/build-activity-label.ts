import type { GroupActivityItem } from '@seta/planner';

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function fmtDate(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : dateFmt.format(d);
}

const PRIORITY_NAME: Record<number, string> = { 1: 'Urgent', 3: 'High', 5: 'Medium', 9: 'Low' };

const FIELD_LABEL: Record<string, string> = {
  due_at: 'due date',
  start_at: 'start date',
  priority_number: 'priority',
  percent_complete: 'progress',
  description: 'description',
  title: 'title',
  bucket_id: 'column',
  order_hint: 'order',
  skill_tags: 'tags',
};

function humanField(f: string): string {
  return FIELD_LABEL[f] ?? f.replace(/[-_]/g, ' ');
}

export function buildActivityLabel(item: GroupActivityItem): string {
  const actor = item.actor_display_name ?? 'Someone';
  const target = item.target_title;
  const targetUser = item.target_user_display_name;
  const before = item.before_state ?? {};
  const after = item.after_state ?? {};

  switch (item.event_type) {
    case 'planner.group.member.role-changed': {
      const from = String(before.role ?? '?');
      const to = String(after.role ?? '?');
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

    case 'planner.task.moved': {
      const t = target ?? 'a task';
      // Cross-plan move carries plan_name on after_state.
      if (typeof after.plan_name === 'string') {
        return `${actor} moved "${t}" to plan ${after.plan_name}`;
      }
      const fromB = before.bucket_name;
      const toB = after.bucket_name;
      if (typeof fromB === 'string' && typeof toB === 'string') {
        return `${actor} moved "${t}" from ${fromB} to ${toB}`;
      }
      if (typeof toB === 'string') return `${actor} moved "${t}" to ${toB}`;
      return `${actor} moved "${t}"`;
    }

    case 'planner.task.updated': {
      const fields = item.changed_fields ?? [];
      const t = target ?? 'a task';
      if (fields.length === 1) {
        const f = fields[0];
        if (f === 'title') {
          const from = before.title;
          const to = after.title;
          return from && to ? `${actor} renamed "${from}" to "${to}"` : `${actor} renamed a task`;
        }
        if (f === 'due_at') {
          const from = fmtDate(before.due_at);
          const to = fmtDate(after.due_at);
          if (!to) return `${actor} cleared the due date on "${t}"`;
          return from
            ? `${actor} changed the due date on "${t}" from ${from} to ${to}`
            : `${actor} set the due date on "${t}" to ${to}`;
        }
        if (f === 'start_at') {
          const from = fmtDate(before.start_at);
          const to = fmtDate(after.start_at);
          if (!to) return `${actor} cleared the start date on "${t}"`;
          return from
            ? `${actor} changed the start date on "${t}" from ${from} to ${to}`
            : `${actor} set the start date on "${t}" to ${to}`;
        }
        if (f === 'priority_number') {
          const to = PRIORITY_NAME[Number(after.priority_number)] ?? null;
          return to
            ? `${actor} changed priority on "${t}" to ${to}`
            : `${actor} changed priority on "${t}"`;
        }
        if (f === 'percent_complete') {
          const to = Number(after.percent_complete);
          return Number.isFinite(to)
            ? `${actor} set progress on "${t}" to ${to}%`
            : `${actor} updated progress on "${t}"`;
        }
        if (f === 'description') return `${actor} updated the description of "${t}"`;
      }
      return fields.length > 0
        ? `${actor} updated ${fields.map(humanField).join(', ')} on "${t}"`
        : `${actor} updated "${t}"`;
    }

    case 'planner.task.completed':
      return `${actor} completed "${target ?? 'a task'}"`;
    case 'planner.task.reopened':
      return `${actor} reopened "${target ?? 'a task'}"`;
    case 'planner.task.deleted':
      return `${actor} deleted "${target ?? 'a task'}"`;
    case 'planner.task.restored':
      return `${actor} restored "${target ?? 'a task'}"`;
    case 'planner.task.created':
      return `${actor} created task "${target ?? 'a task'}"`;

    case 'planner.group.created':
      return `${actor} created group "${target ?? 'a group'}"`;
    case 'planner.group.updated': {
      const fields = item.changed_fields ?? [];
      if (fields.length === 1 && fields[0] === 'name') {
        const from = before.name;
        const to = after.name;
        return from && to
          ? `${actor} renamed the group from "${from}" to "${to}"`
          : `${actor} renamed the group`;
      }
      return fields.length > 0
        ? `${actor} updated group ${fields.map(humanField).join(', ')}`
        : `${actor} updated the group`;
    }

    case 'planner.plan.created':
      return `${actor} created plan "${target ?? 'a plan'}"`;
    case 'planner.plan.updated':
      return `${actor} updated plan "${target ?? 'a plan'}"`;
    case 'planner.plan.deleted':
      return `${actor} deleted plan "${target ?? 'a plan'}"`;
    case 'planner.plan.archived':
      return `${actor} archived plan "${target ?? 'a plan'}"`;
    case 'planner.plan.unarchived':
      return `${actor} unarchived plan "${target ?? 'a plan'}"`;

    case 'planner.bucket.created':
      return `${actor} created bucket "${target ?? 'a bucket'}"`;
    case 'planner.bucket.updated':
      return `${actor} renamed bucket "${target ?? 'a bucket'}"`;
    case 'planner.bucket.deleted':
      return `${actor} deleted bucket "${target ?? 'a bucket'}"`;
    case 'planner.bucket.moved':
      return `${actor} reordered bucket "${target ?? 'a bucket'}"`;

    case 'planner.task.label.applied':
      return `${actor} added a label to "${target ?? 'a task'}"`;
    case 'planner.task.label.unapplied':
      return `${actor} removed a label from "${target ?? 'a task'}"`;
    case 'planner.task.checklist.item.added':
      return `${actor} added a checklist item to "${target ?? 'a task'}"`;
    case 'planner.task.checklist.item.updated':
      return `${actor} updated a checklist item on "${target ?? 'a task'}"`;
    case 'planner.task.checklist.item.removed':
      return `${actor} removed a checklist item from "${target ?? 'a task'}"`;

    default:
      return [actor, item.verb, target].filter(Boolean).join(' ');
  }
}
