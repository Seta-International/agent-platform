import type { CandidateListItem } from '../api/hiring-client.ts';

function toCsvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function formatAppliedDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toISOString().slice(0, 10);
}

/** Pure function — returns CSV string with UTF-8 BOM. Separated from DOM trigger for testability. */
export function buildCandidatesCsv(rows: CandidateListItem[]): string {
  const header = [
    'Name',
    'Position',
    'Seniority',
    'Source',
    'Stage',
    'Rating',
    'Fit',
    'Skills',
    'Applied at',
  ];
  const lines = rows.map((r) => [
    r.name,
    r.requisition_title,
    r.seniority ?? '',
    r.source ?? '',
    r.stage,
    r.rating ?? '',
    r.fit?.required === 0 ? '' : `${Math.round((r.fit?.score ?? 0) * 100)}%`,
    r.skills?.map((s) => s.skill_name).join('; ') ?? '',
    r.applied_at ? formatAppliedDate(r.applied_at) : '',
  ]);
  const formattedRows = [header, ...lines].map((line) => line.map(toCsvCell).join(',')).join('\n');
  return `\uFEFF${formattedRows}`;
}

/** Trigger browser download of candidates CSV with UTF-8 BOM encoding for Excel compatibility. */
export function exportCandidatesCsv(rows: CandidateListItem[]): void {
  const csv = buildCandidatesCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'candidates.csv';
  a.click();
  URL.revokeObjectURL(url);
}
