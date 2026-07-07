import type { AssigneeSuggestion } from '../api/planner-client';
import {
  displayedSkills,
  matchLabel,
  matchRationale,
  scorePercent,
} from './assignee-suggestion-format';

// Shared with the score pill / AI-matches heading in TaskDetailAssigneesCard.
const AI_GRADIENT = 'linear-gradient(120deg, #0047FF 0%, #6d5cff 46%, #22d3ee 100%)';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}

/** Rich, structured hover card explaining why a person was suggested. */
export function SuggestionScoreTooltip({ suggestion: s }: { suggestion: AssigneeSuggestion }) {
  const pct = scorePercent(s);
  const skills = displayedSkills(s);
  return (
    <div className="flex w-56 flex-col gap-2 py-1 text-caption">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-ink">{matchLabel(s.score)}</span>
        <span
          className="bg-clip-text text-sm font-bold tabular-nums text-transparent"
          style={{ backgroundImage: AI_GRADIENT }}
        >
          {pct}%
        </span>
      </div>

      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-1">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundImage: AI_GRADIENT }}
        />
      </div>

      <p className="text-ink-muted">{matchRationale(s)}</p>

      <div className="flex flex-col gap-1 border-t border-hairline pt-1.5">
        {skills.length > 0 && (
          <Row
            label="Skills"
            value={
              <span className="inline-flex flex-wrap justify-end gap-1">
                {skills.join(', ')}
                {s.exact_overlap > 0 && (
                  <span className="rounded bg-primary-tint px-1 font-semibold text-primary-ink">
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
