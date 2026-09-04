import { PLATFORM_TIMEZONE } from '@seta/agent-sdk';
import {
  type ActionTaskSnapshot,
  DOMAIN_FIELD_BY_TOOL_FIELD,
  PERCENT_COMPLETE_BY_WORD,
  PRIORITY_NUMBER_BY_WORD,
  type UpdateTaskActionPatch,
} from './schemas.ts';

const WEEKDAYS = ['Chủ Nhật', 'thứ Hai', 'thứ Ba', 'thứ Tư', 'thứ Năm', 'thứ Sáu', 'thứ Bảy'];

/**
 * A date the model can only copy, never miscompute.
 *
 * Production wrote "Thứ Hai, 15/08/2026" for a Saturday even though the prompt
 * already carried today's date and weekday — deriving a weekday is arithmetic, and
 * that is the half a small model gets wrong. Rendering it here removes the
 * arithmetic from the model's job entirely.
 */
export function renderDay(iso: string, tz: string = PLATFORM_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  // Index the Vietnamese table by the real LOCAL day rather than translating
  // Intl's English label. Noon UTC on the local calendar date cannot roll over.
  const localNoon = new Date(`${get('year')}-${get('month')}-${get('day')}T12:00:00Z`);
  return `${WEEKDAYS[localNoon.getUTCDay()]} ${get('day')}/${get('month')}/${get('year')}`;
}

const WORD_BY_PRIORITY = Object.fromEntries(
  Object.entries(PRIORITY_NUMBER_BY_WORD).map(([w, n]) => [n, w]),
) as Record<number, string>;
const WORD_BY_PERCENT = Object.fromEntries(
  Object.entries(PERCENT_COMPLETE_BY_WORD).map(([w, n]) => [n, w]),
) as Record<number, string>;
const TOOL_FIELD_BY_DOMAIN_FIELD = Object.fromEntries(
  Object.entries(DOMAIN_FIELD_BY_TOOL_FIELD).map(([t, d]) => [d, t]),
) as Record<string, string>;

export interface RenderedDiffRow {
  field: string;
  from: string;
  to: string;
}

function render(domainField: string, value: unknown): string {
  if (value === null || value === undefined) return 'không có';
  if (domainField === 'due_at' || domainField === 'start_at') return renderDay(String(value));
  if (domainField === 'priority_number') return WORD_BY_PRIORITY[Number(value)] ?? String(value);
  if (domainField === 'percent_complete') return WORD_BY_PERCENT[Number(value)] ?? String(value);
  return String(value);
}

/**
 * The proposal as a from→to list, in the model's own vocabulary, built from the
 * stored snapshot and the patch that was actually persisted.
 *
 * Field order follows `DOMAIN_FIELD_BY_TOOL_FIELD` so two runs of the same
 * revision render identically — a diff whose row order wanders is a diff nobody
 * can diff.
 */
export function renderPatchDiff(
  patch: UpdateTaskActionPatch,
  snapshot: ActionTaskSnapshot,
): RenderedDiffRow[] {
  const rows: RenderedDiffRow[] = [];
  for (const domainField of Object.values(DOMAIN_FIELD_BY_TOOL_FIELD)) {
    if (!(domainField in patch)) continue;
    rows.push({
      field: TOOL_FIELD_BY_DOMAIN_FIELD[domainField] ?? domainField,
      from: render(domainField, (snapshot as unknown as Record<string, unknown>)[domainField]),
      to: render(domainField, (patch as unknown as Record<string, unknown>)[domainField]),
    });
  }
  return rows;
}
