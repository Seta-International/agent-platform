import { Link } from '@tanstack/react-router';
import { ChevronRight, ExternalLink, Layout } from 'lucide-react';
import { MtTaskRow, type MyTasksRowTask } from './mt-task-row';

export interface PlanGroupRef {
  id: string;
  name: string;
  color: string;
}

export interface GroupRef {
  id: string;
  name: string;
}

export interface PlanGroupData {
  plan: PlanGroupRef;
  group: GroupRef;
  tasks: ReadonlyArray<MyTasksRowTask>;
}

interface Props {
  group: PlanGroupData;
  first?: boolean;
}

export function PlanGroup({ group, first = false }: Props) {
  const taskCount = group.tasks.length;
  return (
    <div
      data-testid="plan-group"
      data-plan-id={group.plan.id}
      className={
        (first ? 'mt-2.5' : 'mt-3.5') +
        ' border border-hairline rounded-lg bg-canvas overflow-hidden'
      }
    >
      <div className="flex items-center gap-2 pl-0 pr-3 py-2 border-b border-hairline-tertiary bg-surface-1 relative">
        <div
          data-testid="plan-color-rail"
          className="w-[3px] self-stretch rounded-r-[2px]"
          style={{ background: group.plan.color }}
        />
        <Layout size={12} className="ml-2" style={{ color: group.plan.color }} />
        <span className="text-[12.5px] font-semibold">{group.plan.name}</span>
        <ChevronRight size={9} className="text-ink-tertiary" />
        <span className="text-[11px] text-ink-subtle">{group.group.name}</span>
        <div className="flex-1" />
        <span className="text-[11px] text-ink-subtle">
          {taskCount} task{taskCount !== 1 ? 's' : ''}
        </span>
        <Link
          to="/planner/plans/$planId"
          params={{ planId: group.plan.id }}
          className="inline-flex items-center gap-1 h-[22px] px-1.5 text-[11px] text-ink-muted hover:text-ink rounded-md no-underline"
        >
          Open plan
          <ExternalLink size={10} />
        </Link>
      </div>

      <div
        className={
          'grid grid-cols-[24px_60px_minmax(0,1fr)_90px_130px_100px_110px_120px] ' +
          'gap-3 px-6 pr-3.5 py-[7px] text-[10.5px] font-medium text-ink-subtle ' +
          'uppercase tracking-[0.06em] border-b border-hairline-tertiary bg-canvas'
        }
      >
        <span />
        <span />
        <span>Task</span>
        <span>Priority</span>
        <span>Progress</span>
        <span>Due</span>
        <span>Labels</span>
        <span>Assignees</span>
      </div>

      {group.tasks.map((t) => (
        <MtTaskRow key={t.id} task={t} />
      ))}
    </div>
  );
}
