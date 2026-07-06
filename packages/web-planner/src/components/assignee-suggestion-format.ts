import type { AssigneeSuggestion } from '../api/planner-client';

export function scorePercent(s: AssigneeSuggestion): number {
  return Math.round(s.score * 100);
}

/** Compact muted line under the name, e.g. "React · free 12h". */
export function formatSuggestionReason(s: AssigneeSuggestion): string {
  const parts: string[] = [];
  if (s.skills.length > 0) parts.push(s.skills.slice(0, 2).join(', '));
  if (s.hours_available_this_week != null)
    parts.push(`free ${Math.round(s.hours_available_this_week)}h`);
  else if (s.open_task_count != null) parts.push(`${s.open_task_count} open`);
  return parts.length > 0 ? parts.join(' · ') : 'Suggested';
}

/** Full hover explanation, e.g.
 * "Match 92% — Skills: React, TypeScript (2 exact) · 2 open tasks · ~12h free · GMT+7". */
export function formatSuggestionTooltip(s: AssigneeSuggestion): string {
  const parts: string[] = [];
  if (s.skills.length > 0) {
    const exact = s.exact_overlap > 0 ? ` (${s.exact_overlap} exact)` : '';
    parts.push(`Skills: ${s.skills.join(', ')}${exact}`);
  }
  if (s.open_task_count != null) parts.push(`${s.open_task_count} open tasks`);
  if (s.hours_available_this_week != null)
    parts.push(`~${Math.round(s.hours_available_this_week)}h free this week`);
  if (s.timezone) parts.push(s.timezone);
  const detail = parts.length > 0 ? ` — ${parts.join(' · ')}` : '';
  return `Match ${scorePercent(s)}%${detail}`;
}
