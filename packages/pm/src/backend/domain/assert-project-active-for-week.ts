import { PmError } from '../rbac.ts';
import { isoWeekRange } from './iso-week.ts';

/** Renders an ISO `YYYY-MM-DD` date as `DD-MM-YYYY` for user-facing messages. */
function ddmmyyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}-${m}-${y}`;
}

/**
 * True once the project's End Date falls before the reporting week's Monday — a project
 * ending mid-week is NOT "ended" for that week (FUT-984 AC2). A project with no End Date
 * is never ended.
 */
export function isProjectEndedForWeek(
  project_date_to: string | null,
  iso_year: number,
  iso_week: number,
): boolean {
  if (!project_date_to) return false;
  return project_date_to < isoWeekRange(iso_year, iso_week).from;
}

/**
 * A Weekly Report can't be created for a reporting week that starts after the project's own
 * End Date — but a project ending mid-week still gets a normal report for that final week
 * (FUT-984 AC2). A project with no End Date is never blocked.
 */
export function assertProjectActiveForWeek(
  project_date_to: string | null,
  iso_year: number,
  iso_week: number,
): void {
  if (!isProjectEndedForWeek(project_date_to, iso_year, iso_week)) return;
  throw new PmError(
    'VALIDATION',
    // biome-ignore lint/style/noNonNullAssertion: isProjectEndedForWeek(...) === true implies non-null
    `This project ended ${ddmmyyyy(project_date_to!)}, before this reporting week started`,
  );
}
