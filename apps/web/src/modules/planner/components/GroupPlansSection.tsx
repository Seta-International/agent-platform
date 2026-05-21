import type { PlanRow } from '@seta/planner';
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
  plans: ReadonlyArray<PlanRow>;
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {plans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
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
