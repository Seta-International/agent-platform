import { HiringError } from '../rbac.ts';

/** Renders an ISO `YYYY-MM-DD` date as `DD-MM-YYYY` for user-facing messages. */
function ddmmyyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}-${m}-${y}`;
}

/** True once the project's End Date is before today. A project with no End Date never ends. */
export function isProjectEndedForRequisition(
  project_date_to: string | null,
  today: string,
): boolean {
  if (!project_date_to) return false;
  return project_date_to < today;
}

/**
 * A new Requisition can't be opened against a project whose End Date has already passed
 * (FUT-984 AC1).
 */
export function assertProjectOpenForRequisition(
  project_date_to: string | null,
  today: string,
): void {
  if (!isProjectEndedForRequisition(project_date_to, today)) return;
  throw new HiringError(
    'VALIDATION',
    // biome-ignore lint/style/noNonNullAssertion: isProjectEndedForRequisition(...) === true implies non-null
    `This project ended ${ddmmyyyy(project_date_to!)} — a new Requisition can't be opened for it`,
  );
}
