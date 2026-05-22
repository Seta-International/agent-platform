import type { PlanWithRollupsRow } from '@seta/planner';
import { Plus } from 'lucide-react';
import { PlanCard } from './PlanCard';

// Theme color mapping for PR2. Eventually will move to shared-ui.
type GroupTheme = 'teal' | 'purple' | 'green' | 'blue' | 'pink' | 'orange' | 'red';

const THEME_HEX: Record<GroupTheme, string> = {
  teal: '#207087',
  purple: '#7a2f7c',
  green: '#1f8a4c',
  blue: '#0047FF',
  pink: '#c0367f',
  orange: '#b86e00',
  red: '#c53030',
};

export { THEME_HEX };

interface Props {
  groupName: string; // shown in the dashed tile copy
  plans: ReadonlyArray<PlanWithRollupsRow>;
  themeColor: string; // hex from group's theme
  canCreatePlan: boolean;
  onCreatePlan: () => void;
  onPlanClick: (planId: string) => void;
}

export function GroupPlansSection({
  groupName,
  plans,
  themeColor,
  canCreatePlan,
  onCreatePlan,
  onPlanClick,
}: Props) {
  if (plans.length === 0 && !canCreatePlan) {
    return <div className="grid grid-cols-1 md:grid-cols-2 gap-3" />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
      {plans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          status={plan.status ?? undefined}
          progressPct={plan.percent_complete ?? undefined}
          taskCount={plan.task_count}
          openTaskCount={plan.open_task_count}
          dueDate={plan.latest_due_at ?? undefined}
          ownerDisplayName={plan.owner_display_name ?? undefined}
          themeColor={themeColor}
          onClick={() => onPlanClick(plan.id)}
        />
      ))}
      {canCreatePlan && (
        <button
          type="button"
          onClick={onCreatePlan}
          className="min-h-[158px] border border-dashed border-hairline-strong rounded-lg bg-transparent flex flex-col items-center justify-center gap-1.5 text-ink-subtle text-sm cursor-pointer hover:bg-surface-1"
        >
          <Plus className="size-4" />
          <span>Create a plan in {groupName}</span>
        </button>
      )}
    </div>
  );
}
