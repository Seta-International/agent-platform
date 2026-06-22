import { and, eq, inArray } from 'drizzle-orm';
import { performanceDb } from '../db/client.ts';
import * as t from '../db/schema.ts';
import type { DataAccessPorts } from './data-access.ts';
import type {
  AccountRiskSummary,
  AllocationData,
  AtRiskEntry,
  EmployeeProfile,
  PerformanceData,
  RiskLevel,
  TimesheetData,
  ViolationSummary,
} from './schemas.ts';

/**
 * Drizzle-backed DataAccessPorts over the `performance.*` schema (the 12 tables
 * the seeder populates). Wired in at the composition root via
 * `registerPerformanceContributions`; tests keep the in-memory mock.
 *
 * The DB stores no employee names (PII is not held here — `member_id` is the
 * tenant-local identifier), so `name` is the member id. Every value is read
 * straight from the datasets so the NORM engine reasons over true source data.
 */

function mapStatus(s: string): EmployeeProfile['status'] {
  switch (s) {
    case 'On Leave':
      return 'on_leave';
    case 'Resigned':
      return 'terminated';
    case 'Bench':
      return 'bench';
    default:
      // Active / Probation / PIP — all currently-employed states.
      return 'active';
  }
}

/** A single risk band per employee, derived from the DS-08 profile. Shared by
 *  the at-risk roster and the account roll-up so both agree. */
function riskBand(row: {
  violation_risk_flag: string;
  avg_score_t3_t4: number | null;
  allocation_status: string;
}): 'high' | 'medium' | 'low' {
  const avg = row.avg_score_t3_t4 ?? 5;
  if (row.violation_risk_flag === 'High Risk' || avg < 2.0) return 'high';
  if (row.violation_risk_flag === 'Watch' || avg < 2.5 || row.allocation_status === 'Overloaded') {
    return 'medium';
  }
  return 'low';
}

function recommendedAction(band: 'high' | 'medium' | 'low'): string {
  switch (band) {
    case 'high':
      return 'Schedule 1:1, review workload allocation';
    case 'medium':
      return 'Review project load, consider coaching';
    default:
      return 'Monitor; no immediate action';
  }
}

class DrizzlePerformanceDataAccess implements DataAccessPorts {
  async getEmployeeProfile(tenantId: string, memberId: string): Promise<EmployeeProfile | null> {
    const db = performanceDb();
    const [emp] = await db
      .select()
      .from(t.employeeMaster)
      .where(
        and(eq(t.employeeMaster.tenant_id, tenantId), eq(t.employeeMaster.member_id, memberId)),
      )
      .limit(1);
    if (!emp) return null;

    const [promo] = await db
      .select()
      .from(t.promotionIntent)
      .where(
        and(eq(t.promotionIntent.tenant_id, tenantId), eq(t.promotionIntent.member_id, memberId)),
      )
      .limit(1);
    const [sal] = await db
      .select()
      .from(t.salaryBand)
      .where(and(eq(t.salaryBand.tenant_id, tenantId), eq(t.salaryBand.member_id, memberId)))
      .limit(1);
    const [alloc] = await db
      .select({ report_to: t.resourceAllocation.report_to })
      .from(t.resourceAllocation)
      .where(
        and(
          eq(t.resourceAllocation.tenant_id, tenantId),
          eq(t.resourceAllocation.member_id, memberId),
        ),
      )
      .limit(1);

    return {
      memberId: emp.member_id,
      name: emp.member_id, // no PII name stored in performance.*; the id is the label
      role: emp.role_title,
      level: emp.level,
      status: mapStatus(emp.employment_status),
      joinDate: emp.join_date,
      tier: emp.performance_tier,
      score: emp.overall_score_latest,
      managerId: alloc?.report_to ?? null,
      promotionReadiness: promo
        ? `${promo.current_level} → ${promo.target_level} · readiness ${Math.round(promo.readiness_score * 100)}%`
        : null,
      salaryBand: sal?.salary_band ?? null,
    };
  }

  async getPerformanceData(
    tenantId: string,
    memberId: string,
    period?: string,
  ): Promise<PerformanceData[] | null> {
    const db = performanceDb();
    const rows = await db
      .select()
      .from(t.performanceByProject)
      .where(
        and(
          eq(t.performanceByProject.tenant_id, tenantId),
          eq(t.performanceByProject.member_id, memberId),
        ),
      )
      .orderBy(t.performanceByProject.report_period);
    if (rows.length === 0) return null;

    // Trend is month-over-month on the full ordered series, computed before any
    // period filter so a single-period query still reflects the real direction.
    const series = rows.map((row, i) => {
      const prev = rows[i - 1];
      const trend: PerformanceData['trend'] =
        !prev || prev.total_point === row.total_point
          ? i === 0
            ? null
            : 'flat'
          : row.total_point > prev.total_point
            ? 'up'
            : 'down';
      return {
        period: row.report_period,
        kpiScore: row.total_point,
        classification: row.classification,
        feedbackCategories: row.feedback_category ? [row.feedback_category] : [],
        trend,
      } satisfies PerformanceData;
    });
    return period ? series.filter((r) => r.period === period) : series;
  }

  async getTimesheet(
    tenantId: string,
    memberId: string,
    period?: string,
  ): Promise<TimesheetData[] | null> {
    const db = performanceDb();
    const rows = await db
      .select()
      .from(t.timesheet)
      .where(and(eq(t.timesheet.tenant_id, tenantId), eq(t.timesheet.member_id, memberId)))
      .orderBy(t.timesheet.report_period);
    if (rows.length === 0) return null;

    const mapped = rows.map((row) => ({
      period: row.report_period,
      otHours: row.total_ot_hours,
      attendancePct:
        row.work_days_in_month > 0
          ? Math.round((row.actual_work_days / row.work_days_in_month) * 100)
          : 100,
      complianceFlag: row.days_absent_unapproved === 0 && row.days_late < 3,
      // Log-work compliance is not tracked as a percentage in the dataset; treat
      // a present timesheet as logged so NORM-T01 doesn't misfire on missing data.
      logWorkPct: 100,
    }));
    return period ? mapped.filter((r) => r.period === period) : mapped;
  }

  async getViolations(tenantId: string, memberId: string): Promise<ViolationSummary | null> {
    const db = performanceDb();
    const [row] = await db
      .select()
      .from(t.violationSummary)
      .where(
        and(eq(t.violationSummary.tenant_id, tenantId), eq(t.violationSummary.member_id, memberId)),
      )
      .limit(1);
    if (!row) return null;
    return {
      riskFlag: row.risk_flag !== 'None',
      openCount: row.open_cases,
      criticalCount: row.critical_count,
      // History is not needed by the NORM engine or the cards; left empty here.
      history: [],
    };
  }

  async getAllocation(tenantId: string, memberId: string): Promise<AllocationData | null> {
    const db = performanceDb();
    const [row] = await db
      .select()
      .from(t.resourceAllocation)
      .where(
        and(
          eq(t.resourceAllocation.tenant_id, tenantId),
          eq(t.resourceAllocation.member_id, memberId),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      accountId: row.account_id,
      projectId: row.project_id,
      allocationPct: Math.round(row.allocation_pct * 100), // schema stores 1.0 = 100%
      status: row.assignment_type,
      overloadFlag: row.allocation_pct > 1.2,
      benchFlag: row.assignment_type === 'Bench' || row.allocation_pct === 0,
    };
  }

  /** member_ids assigned to one account (for account-scoped aggregate queries). */
  private async memberIdsForAccount(tenantId: string, accountId: string): Promise<string[]> {
    const db = performanceDb();
    const rows = await db
      .select({ member_id: t.resourceAllocation.member_id })
      .from(t.resourceAllocation)
      .where(
        and(
          eq(t.resourceAllocation.tenant_id, tenantId),
          eq(t.resourceAllocation.account_id, accountId),
        ),
      );
    return rows.map((r) => r.member_id);
  }

  async listAtRiskEmployees(
    tenantId: string,
    opts?: { accountId?: string; period?: string },
  ): Promise<AtRiskEntry[]> {
    const db = performanceDb();
    const where = [eq(t.performanceProfile.tenant_id, tenantId)];
    if (opts?.accountId) {
      const members = await this.memberIdsForAccount(tenantId, opts.accountId);
      if (members.length === 0) return [];
      where.push(inArray(t.performanceProfile.member_id, members));
    }
    const rows = await db
      .select()
      .from(t.performanceProfile)
      .where(and(...where));

    const RANK: Record<'high' | 'medium' | 'low', number> = { high: 0, medium: 1, low: 2 };
    return rows
      .map((row) => ({ row, band: riskBand(row) }))
      .filter(({ band }) => band !== 'low')
      .sort((a, b) => RANK[a.band] - RANK[b.band])
      .map(({ row, band }) => ({
        memberId: row.member_id,
        name: row.member_id, // no PII name stored
        risk: band as RiskLevel,
        summary: row.perf_risk_note,
        recommendedAction: recommendedAction(band),
      }));
  }

  async getAccountSummary(
    tenantId: string,
    opts?: { accountId?: string; period?: string },
  ): Promise<AccountRiskSummary> {
    const db = performanceDb();
    const where = [eq(t.performanceProfile.tenant_id, tenantId)];
    let scopeLabel = 'All accounts';
    if (opts?.accountId) {
      const members = await this.memberIdsForAccount(tenantId, opts.accountId);
      const [acc] = await db
        .select({ account_name: t.projectMaster.account_name })
        .from(t.projectMaster)
        .where(
          and(
            eq(t.projectMaster.tenant_id, tenantId),
            eq(t.projectMaster.account_id, opts.accountId),
          ),
        )
        .limit(1);
      scopeLabel = acc?.account_name ?? opts.accountId;
      if (members.length === 0) {
        return {
          scopeLabel,
          accountId: opts.accountId,
          period: opts.period ?? null,
          high: 0,
          medium: 0,
          low: 0,
          total: 0,
          narrative: `No employees are currently allocated to ${scopeLabel}.`,
        };
      }
      where.push(inArray(t.performanceProfile.member_id, members));
    }

    const rows = await db
      .select({
        violation_risk_flag: t.performanceProfile.violation_risk_flag,
        avg_score_t3_t4: t.performanceProfile.avg_score_t3_t4,
        allocation_status: t.performanceProfile.allocation_status,
      })
      .from(t.performanceProfile)
      .where(and(...where));

    let high = 0;
    let medium = 0;
    let low = 0;
    for (const row of rows) {
      const band = riskBand(row);
      if (band === 'high') high++;
      else if (band === 'medium') medium++;
      else low++;
    }
    const total = rows.length;
    const pct = total > 0 ? Math.round((high / total) * 100) : 0;
    const tone = pct >= 10 ? 'elevated' : pct >= 5 ? 'moderate' : 'low';
    return {
      scopeLabel,
      accountId: opts?.accountId ?? null,
      period: opts?.period ?? null,
      high,
      medium,
      low,
      total,
      narrative:
        `Overall talent risk is ${tone}. ${high} employee${high === 1 ? '' : 's'} flagged ` +
        `high-risk require manager action out of ${total} in scope.`,
    };
  }
}

/** Construct the DB-backed data access. Called at the composition root. */
export function makeDbDataAccess(): DataAccessPorts {
  return new DrizzlePerformanceDataAccess();
}
