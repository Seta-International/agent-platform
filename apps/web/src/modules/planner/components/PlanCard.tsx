import type { PlanRow } from '@seta/planner';
import { Avatar, AvatarFallback, StatusPill } from '@seta/shared-ui';

export type PlanStatus = 'on-track' | 'at-risk' | 'off-track';

interface PlanCardProps {
  plan: PlanRow;
  status?: PlanStatus | null; // PR2: null/undefined → no status pill rendered
  progressPct?: number | null; // 0..1, optional
  taskCount?: number; // optional
  openTaskCount?: number; // optional
  dueDate?: string | null; // ISO; rendered as short date or "—"
  ownerDisplayName?: string | null; // optional
  themeColor?: string; // hex, used for color rail and progress bar; default '#0047FF'
  onClick?: () => void; // navigates to plan board — caller wires
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
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

export function PlanCard({
  plan,
  status,
  progressPct,
  taskCount,
  openTaskCount,
  dueDate,
  ownerDisplayName,
  themeColor = '#0047FF',
  onClick,
}: PlanCardProps) {
  const subtext = subtextParts(taskCount, openTaskCount, dueDate);

  const pillKind = status === 'on-track' ? 'active' : status === 'at-risk' ? 'pending' : 'blocked';

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative cursor-pointer rounded-lg border border-hairline bg-canvas p-4 text-left w-full hover:border-hairline-strong hover:shadow-sm transition"
    >
      {/* Color rail */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r"
        style={{ background: themeColor }}
      />

      {/* Top row: name + status pill */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-ink truncate">{plan.name}</p>
          {subtext != null && <p className="text-xs text-ink-subtle mt-0.5">{subtext}</p>}
        </div>
        {status != null && (
          <div className="shrink-0">
            <StatusPill kind={pillKind} />
          </div>
        )}
      </div>

      {/* Progress section */}
      {progressPct != null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-ink-subtle">
            <span>Progress</span>
            <span>{Math.round(progressPct * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-1">
            <div
              style={{ width: `${progressPct * 100}%`, background: themeColor, height: '100%' }}
            />
          </div>
        </div>
      )}

      {/* Bottom row: owner */}
      <div className="mt-3 flex items-center justify-between">
        <div>
          {ownerDisplayName != null && (
            <div className="flex items-center gap-1.5">
              <Avatar className="size-6 shrink-0">
                <AvatarFallback className="text-[10px] font-semibold">
                  {initials(ownerDisplayName)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-ink-subtle">{ownerDisplayName}</span>
            </div>
          )}
        </div>
        {/* Right: reserved for AvatarStack (PR3+) */}
        <div />
      </div>
    </button>
  );
}
