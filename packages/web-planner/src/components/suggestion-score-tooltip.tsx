import type { ReactNode } from 'react';
import type { AssigneeSuggestion } from '../api/planner-client';
import {
  displayedSkills,
  matchLabel,
  matchRationale,
  scorePercent,
} from './assignee-suggestion-format';

// Brand-cohesive "intelligence" gradient (Seta blue → indigo → cyan) for the
// AI-matches heading, which sits on the light page surface. No token expresses
// a multi-stop brand gradient, so it stays a literal here.
export const AI_GRADIENT = 'linear-gradient(120deg, #0047FF 0%, #6d5cff 46%, #22d3ee 100%)';

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-secondary">{label}</span>
      <span className="text-right font-medium text-primary">{value}</span>
    </div>
  );
}

/** Rich, structured breakdown explaining why a person was suggested. Rendered
 *  inside a light HoverCard surface, so it uses the page theme tokens. */
export function SuggestionScoreTooltip({ suggestion: s }: { suggestion: AssigneeSuggestion }) {
  const pct = scorePercent(s);
  const skills = displayedSkills(s);
  return (
    <div className="t-xs flex w-56 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-primary">{matchLabel(s.score)}</span>
        <span className="text-sm font-bold tabular-nums text-accent">{pct}%</span>
      </div>

      <div
        className="h-1 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--color-border)' }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: 'var(--color-accent)' }}
        />
      </div>

      <p className="text-secondary">{matchRationale(s)}</p>

      <div className="flex flex-col gap-1 border-t border-border pt-1.5">
        {skills.length > 0 && (
          <Row
            label="Skills"
            value={
              <span className="inline-flex flex-wrap justify-end gap-1">
                {skills.join(', ')}
                {s.exact_overlap > 0 && (
                  <span className="rounded bg-accent-muted px-1 font-semibold text-accent">
                    {s.exact_overlap} exact
                  </span>
                )}
              </span>
            }
          />
        )}
        {s.open_task_count != null && (
          <Row
            label="Workload"
            value={`${s.open_task_count} open ${s.open_task_count === 1 ? 'task' : 'tasks'}`}
          />
        )}
        {s.hours_available_this_week != null && (
          <Row label="Availability" value={`~${Math.round(s.hours_available_this_week)}h free`} />
        )}
        {s.timezone && <Row label="Time zone" value={s.timezone} />}
      </div>
    </div>
  );
}
