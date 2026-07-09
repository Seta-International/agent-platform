import { PmError } from '../rbac.ts';

/** Renders an ISO `YYYY-MM-DD` date as `DD-MM-YYYY` for user-facing messages. */
function ddmmyyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}-${m}-${y}`;
}

/**
 * An allocation's date range must fall inside its project's own date range.
 * A project side with no bound (null) is treated as unconstrained on that side.
 */
export function assertWithinProjectRange(args: {
  project_date_from: string | null;
  project_date_to: string | null;
  date_from: string | null;
  date_to: string | null;
}): void {
  const { project_date_from, project_date_to, date_from, date_to } = args;
  if (project_date_from && date_from && date_from < project_date_from) {
    throw new PmError(
      'VALIDATION',
      `Allocation start ${ddmmyyyy(date_from)} is before the project start ${ddmmyyyy(project_date_from)}`,
    );
  }
  if (project_date_to && date_to && date_to > project_date_to) {
    throw new PmError(
      'VALIDATION',
      `Allocation end ${ddmmyyyy(date_to)} is after the project end ${ddmmyyyy(project_date_to)}`,
    );
  }
}
