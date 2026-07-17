import type { PlanWithRollupsRow } from '@seta/planner';
import { Card } from '@seta/shared-ui';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { PERMISSION_DENIED } from '../lib/permission-messages';
import { Paginator } from './Paginator';
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

const DEFAULT_PAGE_SIZE = 9;
const PAGE_SIZE_OPTIONS = [9, 18, 36, 72];

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
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const total = plans.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  if (total === 0 && !canCreatePlan) {
    return (
      <Card variant="muted" padding={0}>
        <div className="px-4 py-16 text-center text-base text-secondary">
          No plans yet in this group.
        </div>
      </Card>
    );
  }

  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const start = safePageIndex * pageSize;
  const pageSlice = plans.slice(start, start + pageSize);
  const showPaginator = total > Math.min(...PAGE_SIZE_OPTIONS);
  // Show the create tile on the last page; disable (not hide) it when the user can't create plans.
  const showCreateTile = safePageIndex === pageCount - 1;

  return (
    <section className="@container">
      <div className="grid grid-cols-1 @lg:grid-cols-2 @3xl:grid-cols-3 gap-3 items-start">
        {pageSlice.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            progressPct={plan.percent_complete ?? undefined}
            taskCount={plan.task_count}
            openTaskCount={plan.open_task_count}
            notStartedCount={plan.not_started_count}
            inProgressCount={plan.in_progress_count}
            completedCount={plan.completed_count}
            dueDate={plan.latest_due_at ?? undefined}
            ownerDisplayName={plan.owner_display_name ?? undefined}
            themeColor={themeColor}
            onClick={() => onPlanClick(plan.id)}
          />
        ))}
        {showCreateTile && (
          <button
            type="button"
            onClick={onCreatePlan}
            disabled={!canCreatePlan}
            title={canCreatePlan ? undefined : PERMISSION_DENIED.plan.create}
            className="min-h-[158px] border border-dashed border-border-strong rounded-lg bg-transparent flex flex-col items-center justify-center gap-1.5 text-secondary text-sm cursor-pointer hover:bg-card transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <Plus className="size-4" />
            <span>Create a plan in {groupName}</span>
          </button>
        )}
      </div>
      {showPaginator && (
        <Paginator
          pageIndex={safePageIndex}
          pageSize={pageSize}
          total={total}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageChange={setPageIndex}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPageIndex(0);
          }}
          itemLabel="plan"
        />
      )}
    </section>
  );
}
