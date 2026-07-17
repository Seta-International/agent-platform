import type { PlanRow } from '@seta/planner';
import { Avatar, Tooltip } from '@seta/shared-ui';

interface PlanCardProps {
  plan: PlanRow;
  /** 0..1, optional. Average percent_complete across the plan's tasks. */
  progressPct?: number | null;
  taskCount?: number;
  openTaskCount?: number;
  /** MS Planner 3-state buckets — percent_complete = 0. */
  notStartedCount?: number;
  /** MS Planner 3-state buckets — percent_complete = 50. */
  inProgressCount?: number;
  /** MS Planner 3-state buckets — percent_complete = 100. */
  completedCount?: number;
  dueDate?: string | null;
  ownerDisplayName?: string | null;
  themeColor?: string;
  onClick?: () => void;
}

const shortDateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function formatShortDate(iso: string): string {
  return shortDateFmt.format(new Date(iso));
}

function subtextParts(
  taskCount: number | undefined,
  openTaskCount: number | undefined,
  dueDate: string | null | undefined,
): string | null {
  if (taskCount === undefined) return null;
  const parts: string[] = [`${taskCount} tasks`];
  if (openTaskCount !== undefined) {
    parts.push(`${openTaskCount} open`);
  }
  if (dueDate) {
    parts.push(`due ${formatShortDate(dueDate)}`);
  }
  return parts.join(' · ');
}

// MS Planner 3-state colors. Completed = green, In progress = amber, Not started = neutral.
const COLOR_COMPLETED = 'var(--color-success, #1f8a4c)';
const COLOR_IN_PROGRESS = 'var(--color-warning, #c2750a)';
const COLOR_NOT_STARTED = 'var(--color-text-disabled, #9aa0a6)';

interface StackedBarProps {
  notStarted: number;
  inProgress: number;
  completed: number;
}

function StackedBar({ notStarted, inProgress, completed }: StackedBarProps) {
  const total = notStarted + inProgress + completed;
  if (total === 0) {
    return <div className="h-1.5 rounded-full bg-surface" aria-hidden />;
  }
  const completedPct = (completed / total) * 100;
  const inProgressPct = (inProgress / total) * 100;
  return (
    <div className="h-1.5 rounded-full bg-surface overflow-hidden flex" aria-hidden>
      <div style={{ width: `${completedPct}%`, background: COLOR_COMPLETED }} />
      <div style={{ width: `${inProgressPct}%`, background: COLOR_IN_PROGRESS, opacity: 0.85 }} />
    </div>
  );
}

interface StateChipProps {
  label: string;
  count: number;
  color: string;
}

function StateChip({ label, count, color }: StateChipProps) {
  return (
    <Tooltip content={`${label}: ${count}`} hasHoverIndication={false}>
      <span
        role="img"
        aria-label={`${label}: ${count}`}
        className="inline-flex items-center gap-1 cursor-default"
      >
        <span
          aria-hidden
          className="inline-block size-1.5 rounded-full"
          style={{ background: color }}
        />
        <span className="text-xs font-medium text-primary tabular-nums" aria-hidden>
          {count}
        </span>
        <span className="sr-only">{label}</span>
      </span>
    </Tooltip>
  );
}

export function PlanCard({
  plan,
  progressPct,
  taskCount,
  openTaskCount,
  notStartedCount,
  inProgressCount,
  completedCount,
  dueDate,
  ownerDisplayName,
  themeColor = '#0047FF',
  onClick,
}: PlanCardProps) {
  const subtext = subtextParts(taskCount, openTaskCount, dueDate);
  const hasBuckets =
    notStartedCount !== undefined || inProgressCount !== undefined || completedCount !== undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative cursor-pointer rounded-lg border border-border bg-body p-3.5 text-left w-full hover:border-border-strong hover:shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-bg focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      {/* Color rail */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r"
        style={{ background: themeColor }}
      />

      <div className="pl-1.5">
        {/* Title + subtext */}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary truncate group-hover:text-accent transition-colors">
            {plan.name}
          </p>
          {subtext != null && <p className="text-xs text-secondary mt-0.5 truncate">{subtext}</p>}
        </div>

        {/* Progress + stacked breakdown */}
        {(progressPct != null || hasBuckets) && (
          <div className="mt-3">
            {progressPct != null && (
              <div className="flex items-center justify-between text-xs text-secondary mb-1">
                <span>Progress</span>
                <span className="font-semibold text-primary tabular-nums">
                  {Math.round(progressPct * 100)}%
                </span>
              </div>
            )}
            {hasBuckets ? (
              <StackedBar
                notStarted={notStartedCount ?? 0}
                inProgress={inProgressCount ?? 0}
                completed={completedCount ?? 0}
              />
            ) : progressPct != null ? (
              // Fallback: classic single-tone progress bar when no bucket data is available.
              <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                <div
                  style={{
                    width: `${progressPct * 100}%`,
                    background: themeColor,
                    height: '100%',
                  }}
                />
              </div>
            ) : null}
            {hasBuckets && (
              <div className="mt-2 flex items-center gap-3">
                <StateChip
                  label="Not started"
                  count={notStartedCount ?? 0}
                  color={COLOR_NOT_STARTED}
                />
                <StateChip
                  label="In progress"
                  count={inProgressCount ?? 0}
                  color={COLOR_IN_PROGRESS}
                />
                <StateChip label="Completed" count={completedCount ?? 0} color={COLOR_COMPLETED} />
              </div>
            )}
          </div>
        )}

        {/* Owner row */}
        {ownerDisplayName != null && (
          <div className="mt-3 flex items-center gap-1.5">
            <Avatar name={ownerDisplayName} size={20} />
            <span className="text-xs text-secondary truncate">{ownerDisplayName}</span>
          </div>
        )}
      </div>
    </button>
  );
}
