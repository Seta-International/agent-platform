import { getDataAccess } from './data-access.ts';
import type { ProfileSnapshot } from './schemas.ts';

/**
 * Assemble a single-employee profile from all five datasets. Never throws on a
 * missing dataset — a null return is recorded in `missingDatasets` so the agent
 * can give a partial response noting what was unavailable.
 *
 * Assembling server-side (rather than having the LLM relay a snapshot back into
 * `evaluate_norm`) is deliberate: the NORM engine then reasons over true source
 * data, not LLM-retyped numbers.
 */
export async function assembleProfile(
  tenantId: string,
  memberId: string,
  period?: string,
): Promise<ProfileSnapshot> {
  const da = getDataAccess();
  const [employee, performance, timesheet, violations, allocation] = await Promise.all([
    da.getEmployeeProfile(tenantId, memberId),
    da.getPerformanceData(tenantId, memberId, period),
    da.getTimesheet(tenantId, memberId, period),
    da.getViolations(tenantId, memberId),
    da.getAllocation(tenantId, memberId),
  ]);

  const missingDatasets: string[] = [];
  if (!employee) missingDatasets.push('employee');
  if (!performance || performance.length === 0) missingDatasets.push('performance');
  if (!timesheet || timesheet.length === 0) missingDatasets.push('timesheet');
  if (!violations) missingDatasets.push('violations');
  if (!allocation) missingDatasets.push('allocation');

  return { employee, performance, timesheet, violations, allocation, missingDatasets };
}
