import type { AssigneeSuggestion } from '../api/planner-client';

export function scorePercent(s: AssigneeSuggestion): number {
  return Math.round(s.score * 100);
}

/** The skills worth showing: those that matched the task, falling back to the
 *  person's full list for a purely profile/vector-based suggestion. */
export function displayedSkills(s: AssigneeSuggestion): string[] {
  return s.matched_skills?.length ? s.matched_skills : s.skills;
}

/** Compact muted line under the name, e.g. "React · free 12h". */
export function formatSuggestionReason(s: AssigneeSuggestion): string {
  const parts: string[] = [];
  const skills = displayedSkills(s);
  if (skills.length > 0) parts.push(skills.slice(0, 2).join(', '));
  if (s.hours_available_this_week != null)
    parts.push(`free ${Math.round(s.hours_available_this_week)}h`);
  else if (s.open_task_count != null) parts.push(`${s.open_task_count} open`);
  return parts.length > 0 ? parts.join(' · ') : 'Suggested';
}

/** Qualitative band for the numeric match score, used as the tooltip title. */
export function matchLabel(score: number): string {
  if (score >= 0.85) return 'Excellent match';
  if (score >= 0.7) return 'Strong match';
  if (score >= 0.5) return 'Good match';
  return 'Possible match';
}

/** One-line rationale: the model's own explanation when present, else a synthesized one. */
export function matchRationale(s: AssigneeSuggestion): string {
  if (s.rationale && s.rationale.trim()) return s.rationale.trim();
  const drivers: string[] = [];
  if (s.exact_overlap > 0) drivers.push('exact skill overlap');
  else if (s.skills.length > 0) drivers.push('related skills');
  const light =
    (s.hours_available_this_week != null && s.hours_available_this_week >= 8) ||
    (s.open_task_count != null && s.open_task_count <= 2);
  if (light) drivers.push('available capacity');
  if (drivers.length === 0) return 'Ranked by overall fit for this task.';
  return `Driven by ${drivers.join(' and ')}.`;
}
