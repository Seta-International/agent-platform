import type {
  AccountRiskSummary,
  AllocationData,
  AtRiskEntry,
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
  /** At-risk roster, optionally scoped to one account / period (Leader view). */
  listAtRiskEmployees(
    tenantId: string,
    opts?: { accountId?: string; period?: string },
  ): Promise<AtRiskEntry[]>;
  /** Account / workforce risk roll-up (BOD view). */
  getAccountSummary(
    tenantId: string,
    opts?: { accountId?: string; period?: string },
  ): Promise<AccountRiskSummary>;
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

// At-risk roster mock, scoped to Account B / April 2026 (the proposal's worked
// example). Risk + summary + action are pre-derived (in production they come
// from the NORM engine run per employee), so the agent never re-classifies.
const MOCK_AT_RISK: AtRiskEntry[] = [
  {
    memberId: 'EMP-031',
    name: 'Nguyễn Thị Lan',
    risk: 'high',
    summary: 'KPI below target, OT exceeds limit, open violation',
    recommendedAction: 'Schedule 1:1, review workload allocation',
  },
  {
    memberId: 'EMP-044',
    name: 'Trần Văn Đức',
    risk: 'medium',
    summary: 'KPI below target, over-allocated for 3 consecutive months',
    recommendedAction: 'Review project load, consider reallocation',
  },
  {
    memberId: 'EMP-019',
    name: 'Lê Minh Khoa',
    risk: 'medium',
    summary: 'Low peer feedback score, missed 2 milestones',
    recommendedAction: 'Coaching plan recommended',
  },
];

// Workforce roll-up mock (BOD view) — all accounts, current cycle.
const MOCK_ACCOUNT_SUMMARY: AccountRiskSummary = {
  scopeLabel: 'All accounts',
  accountId: null,
  period: null,
  high: 8,
  medium: 22,
  low: 94,
  total: 124,
  narrative:
    'Overall talent risk is moderate. 8 employees flagged high-risk require immediate ' +
    'manager action. Account B has the highest concentration of risk (3 high-risk employees).',
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
  async listAtRiskEmployees(
    _tenantId: string,
    opts?: { accountId?: string; period?: string },
  ): Promise<AtRiskEntry[]> {
    // The mock roster is the Account B / April 2026 set; scoping is a no-op here
    // but the real implementation filters by account/period.
    void opts;
    return MOCK_AT_RISK;
  }
  async getAccountSummary(
    _tenantId: string,
    opts?: { accountId?: string; period?: string },
  ): Promise<AccountRiskSummary> {
    void opts;
    return MOCK_ACCOUNT_SUMMARY;
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
