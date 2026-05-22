import type { NotificationListItemNotification } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import {
  CheckCircle,
  FilePlus,
  RotateCcw,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import type * as React from 'react';

type Payload = {
  task_id?: string;
  plan_id?: string;
  group_id?: string;
};

interface RendererSpec {
  eventType: string;
  icon: React.ReactElement;
  getHref: (payload: Payload) => string;
}

const taskHref = (p: Payload): string => `/planner/plans/${p.plan_id}/tasks/${p.task_id}`;
const planHref = (p: Payload): string => `/planner/plans/${p.plan_id}`;
const groupHref = (p: Payload): string => `/planner/groups/${p.group_id}`;

export const plannerRenderers: RendererSpec[] = [
  {
    eventType: 'planner.task.assigned',
    icon: <UserPlus className="size-4" aria-hidden />,
    getHref: taskHref,
  },
  {
    eventType: 'planner.task.unassigned',
    icon: <UserMinus className="size-4" aria-hidden />,
    getHref: taskHref,
  },
  {
    eventType: 'planner.task.completed',
    icon: <CheckCircle className="size-4" aria-hidden />,
    getHref: taskHref,
  },
  {
    eventType: 'planner.task.reopened',
    icon: <RotateCcw className="size-4" aria-hidden />,
    getHref: taskHref,
  },
  {
    eventType: 'planner.group.member.added',
    icon: <Users className="size-4" aria-hidden />,
    getHref: groupHref,
  },
  {
    eventType: 'planner.group.member.role-changed',
    icon: <Shield className="size-4" aria-hidden />,
    getHref: groupHref,
  },
  {
    eventType: 'planner.plan.created',
    icon: <FilePlus className="size-4" aria-hidden />,
    getHref: planHref,
  },
  {
    eventType: 'planner.plan.deleted',
    icon: <Trash2 className="size-4" aria-hidden />,
    getHref: groupHref,
  },
];

const byType = new Map(plannerRenderers.map((r) => [r.eventType, r]));

export function useResolvePlannerNotification(notification: NotificationListItemNotification): {
  icon?: React.ReactNode;
  onClick?: () => void;
} {
  const navigate = useNavigate();
  const spec = byType.get(notification.event_type);
  if (!spec) return {};
  const payload = (notification.payload ?? {}) as Payload;
  return {
    icon: spec.icon,
    onClick: () => {
      // `as never`: TanStack Router types `to` as a union of generated route literals; runtime-composed planner paths can't be expressed in that union.
      void navigate({ to: spec.getHref(payload) as never });
    },
  };
}
