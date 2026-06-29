export interface FitResult {
  met: number;
  required: number;
  score: number;
  strong: boolean;
}

export function computeFit(
  required: { skill_id: string; min_level: number | null }[],
  have: { skill_id: string; level: number | null }[],
): FitResult {
  const levels = new Map(have.map((h) => [h.skill_id, h.level ?? 0]));
  const met = required.filter((r) => {
    if (!levels.has(r.skill_id)) return false;
    return r.min_level == null || (levels.get(r.skill_id) ?? 0) >= r.min_level;
  }).length;
  const total = required.length;
  return {
    met,
    required: total,
    score: total === 0 ? 0 : met / total,
    strong: total > 0 && met === total,
  };
}
