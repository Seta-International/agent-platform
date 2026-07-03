/**
 * `hiring.requisition.grade` is a free-text column with no defined taxonomy anywhere in the
 * system (no DB check constraint, no shared enum). This L1–L6 ladder is a UI-only convenience
 * list for the dropdown — not an enforced/backend value set, so existing free-text grades from
 * before this list existed still display fine.
 */
export const GRADES = ['L3', 'L4', 'L5'] as const;
