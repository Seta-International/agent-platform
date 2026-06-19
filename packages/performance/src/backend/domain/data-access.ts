import type {
  AllocationData,
  EmployeeProfile,
  PerformanceData,
  TimesheetData,
  ViolationSummary,
} from './schemas.ts';

/**
 * The coordination boundary between the AI engineer (tools + agent logic) and
 * the data-layer engineer (DB schema + SQL). The agent tools call these ports;
 * they never query the DB directly. This lets the agent loop run end-to-end on
 * the in-memory mock below while the real Drizzle-backed implementation is built
 * in parallel.
 *
 * `tenantId` is threaded so the real implementation can scope every query; the
 * mock ignores it.
 */
export interface DataAccessPorts {
  getEmployeeProfile(tenantId: string, memberId: string): Promise<EmployeeProfile | null>;
  getPerformanceData(
    tenantId: string,
    memberId: string,
    period?: string,
  ): Promise<PerformanceData[] | null>;
  getTimesheet(
    tenantId: string,
    memberId: string,
    period?: string,
  ): Promise<TimesheetData[] | null>;
  getViolations(tenantId: string, memberId: string): Promise<ViolationSummary | null>;
  getAllocation(tenantId: string, memberId: string): Promise<AllocationData | null>;
}

// --- In-memory mock (draft) -------------------------------------------------
// One worked example: EMP-031, the Senior DevOps from the proposal's Query 1.

interface MockRow {
  employee: EmployeeProfile;
  performance: PerformanceData[];
  timesheet: TimesheetData[];
  violations: ViolationSummary;
  allocation: AllocationData;
}

const MOCK: Record<string, MockRow> = {
  'EMP-031': {
    employee: {
      memberId: 'EMP-031',
      name: 'Nguyễn Văn A',
      role: 'Senior DevOps',
      level: 'L4',
      status: 'active',
      joinDate: '2022-03-01',
      tier: 'Senior',
      score: 2.2,
      managerId: 'TL-BE-002',
      promotionReadiness: 'Not ready — performance below bar this cycle',
      salaryBand: 'B4',
    },
    performance: [
      {
        period: '2026-03',
        kpiScore: 2.8,
        classification: 'Below Expectations',
        feedbackCategories: ['delivery'],
        trend: 'down',
      },
      {
        period: '2026-04',
        kpiScore: 2.2,
        classification: 'At Risk',
        feedbackCategories: ['delivery', 'ownership'],
        trend: 'down',
      },
    ],
    timesheet: [
      { period: '2026-04', otHours: 12, attendancePct: 96, complianceFlag: true, logWorkPct: 98 },
    ],
    violations: {
      riskFlag: true,
      openCount: 1,
      criticalCount: 0,
      history: [{ date: '2026-04-10', severity: 'medium', type: 'process' }],
    },
    allocation: {
      accountId: 'ACC-B',
      projectId: 'ACC-B-P02',
      allocationPct: 100,
      status: 'active',
      overloadFlag: false,
      benchFlag: false,
    },
  },
};

class InMemoryDataAccess implements DataAccessPorts {
  async getEmployeeProfile(_tenantId: string, memberId: string): Promise<EmployeeProfile | null> {
    return MOCK[memberId]?.employee ?? null;
  }
  async getPerformanceData(
    _tenantId: string,
    memberId: string,
    period?: string,
  ): Promise<PerformanceData[] | null> {
    const rows = MOCK[memberId]?.performance;
    if (!rows) return null;
    return period ? rows.filter((r) => r.period === period) : rows;
  }
  async getTimesheet(
    _tenantId: string,
    memberId: string,
    period?: string,
  ): Promise<TimesheetData[] | null> {
    const rows = MOCK[memberId]?.timesheet;
    if (!rows) return null;
    return period ? rows.filter((r) => r.period === period) : rows;
  }
  async getViolations(_tenantId: string, memberId: string): Promise<ViolationSummary | null> {
    return MOCK[memberId]?.violations ?? null;
  }
  async getAllocation(_tenantId: string, memberId: string): Promise<AllocationData | null> {
    return MOCK[memberId]?.allocation ?? null;
  }
}

let current: DataAccessPorts = new InMemoryDataAccess();

/** The active data-access implementation. Defaults to the in-memory mock. */
export function getDataAccess(): DataAccessPorts {
  return current;
}

/** Swap the implementation (real Drizzle ports in production; fixtures in tests). */
export function setDataAccess(ports: DataAccessPorts): void {
  current = ports;
}
