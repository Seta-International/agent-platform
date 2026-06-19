import {
  date,
  doublePrecision,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

// ARIA — Employee Performance Tracking & Reporting Agent.
// Mock-data tables mirror the 12 sheets of ELC_05_Employee_Performance_Tracking.xlsx.
// Every table is tenant-scoped (uuid tenant_id, no cross-schema FK per architecture §6);
// employee identifiers (member_id e.g. "EMP-031") are tenant-local text, not FKs to identity.
export const performanceSchema = pgSchema('performance');

// DS-00 · Employee Master — one row per employee; central reference for every dataset.
export const employeeMaster = performanceSchema.table(
  'employee_master',
  {
    tenant_id: uuid('tenant_id').notNull(),
    member_id: text('member_id').notNull(),
    role_title: text('role_title').notNull(),
    department: text('department').notNull(),
    level: text('level').notNull(), // L1 (intern) → L7 (C-level)
    employment_status: text('employment_status').notNull(), // Active / Probation / On Leave / Resigned / PIP
    join_date: date('join_date', { mode: 'string' }).notNull(),
    performance_tier: text('performance_tier').notNull(),
    overall_score_latest: doublePrecision('overall_score_latest').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenant_id, t.member_id] })],
);

// DS-01 · Resource Allocation — one row per employee (current allocation snapshot).
export const resourceAllocation = performanceSchema.table(
  'resource_allocation',
  {
    tenant_id: uuid('tenant_id').notNull(),
    member_id: text('member_id').notNull(),
    account_id: text('account_id').notNull(),
    project_id: text('project_id').notNull(),
    assignment_type: text('assignment_type').notNull(), // Main Account / Support / Bench / Internal
    role: text('role').notNull(), // BE/FE/QA/PM/BA/DevOps/Mobile/UI-UX/Fullstack
    report_to: text('report_to').notNull(),
    allocation_pct: doublePrecision('allocation_pct').notNull(), // 1.0 = 100%; >1.0 overloaded
    work_on_other: text('work_on_other').notNull(), // Yes / No
    other_project_ids: text('other_project_ids'),
    notes: text('notes'),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.member_id] }),
    index('alloc_by_account').on(t.tenant_id, t.account_id),
  ],
);

// DS-02 · Performance by Project — one row per employee × month (T3 + T4 / 2026).
export const performanceByProject = performanceSchema.table(
  'performance_by_project',
  {
    tenant_id: uuid('tenant_id').notNull(),
    member_id: text('member_id').notNull(),
    report_period: text('report_period').notNull(), // YYYY-MM
    reviewer_id: text('reviewer_id').notNull(),
    total_point: doublePrecision('total_point').notNull(), // 0–5
    classification: text('classification').notNull(), // Excellent / Good / Meets Expectations / Below / Poor
    feedback_category: text('feedback_category').notNull(),
    review_frequency: text('review_frequency').notNull(), // Monthly
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.member_id, t.report_period] }),
    index('perf_by_period').on(t.tenant_id, t.report_period),
  ],
);

// DS-03 · Timesheet & Logwork — one row per employee × month.
export const timesheet = performanceSchema.table(
  'timesheet',
  {
    tenant_id: uuid('tenant_id').notNull(),
    member_id: text('member_id').notNull(),
    report_period: text('report_period').notNull(), // YYYY-MM
    work_days_in_month: integer('work_days_in_month').notNull(),
    days_probation: doublePrecision('days_probation').notNull(),
    days_official: doublePrecision('days_official').notNull(),
    days_holiday_official: doublePrecision('days_holiday_official').notNull(),
    days_leave_approved: doublePrecision('days_leave_approved').notNull(),
    days_late: doublePrecision('days_late').notNull(), // ≥3 → Late Pattern (NORM-T02)
    days_absent_unapproved: doublePrecision('days_absent_unapproved').notNull(), // ≥1 → Violation (NORM-T03)
    actual_work_days: doublePrecision('actual_work_days').notNull(),
    ot_hours_weekday: doublePrecision('ot_hours_weekday').notNull(),
    ot_hours_weekend: doublePrecision('ot_hours_weekend').notNull(),
    ot_hours_holiday: doublePrecision('ot_hours_holiday').notNull(),
    total_ot_hours: doublePrecision('total_ot_hours').notNull(), // >40/mo → OT Overload (NORM-T04)
    night_shift_hours: doublePrecision('night_shift_hours').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenant_id, t.member_id, t.report_period] })],
);

// DS-04 · Violation & Attitude Records — one row per violation event. Sensitive (HR/Leader only).
export const violations = performanceSchema.table(
  'violations',
  {
    tenant_id: uuid('tenant_id').notNull(),
    violation_id: text('violation_id').notNull(),
    member_id: text('member_id').notNull(),
    category: text('category').notNull(), // Attendance/Attitude/Performance/Policy/Conduct
    violation_type_code: text('violation_type_code').notNull(),
    violation_type_desc: text('violation_type_desc').notNull(),
    severity: text('severity').notNull(), // Low/Medium/High/Critical
    consequence: text('consequence').notNull(),
    status: text('status').notNull(), // Open / Under Review / Resolved / Escalated / Closed – No Action
    incident_date: date('incident_date', { mode: 'string' }).notNull(),
    reported_by: text('reported_by').notNull(),
    action_taken: text('action_taken').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.violation_id] }),
    index('violations_by_member').on(t.tenant_id, t.member_id),
  ],
);

// DS-04b · Violation Type Reference — lookup of 26 violation types.
export const violationTypeRef = performanceSchema.table(
  'violation_type_ref',
  {
    tenant_id: uuid('tenant_id').notNull(),
    violation_type_code: text('violation_type_code').notNull(),
    category: text('category').notNull(),
    violation_type_desc: text('violation_type_desc').notNull(),
    typical_severity: text('typical_severity').notNull(),
    typical_consequence: text('typical_consequence').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenant_id, t.violation_type_code] })],
);

// DS-04c · Violation Summary per Employee — aggregated; convenient for risk flagging.
export const violationSummary = performanceSchema.table(
  'violation_summary',
  {
    tenant_id: uuid('tenant_id').notNull(),
    member_id: text('member_id').notNull(),
    total_violations: integer('total_violations').notNull(),
    critical_count: integer('critical_count').notNull(),
    high_count: integer('high_count').notNull(),
    medium_count: integer('medium_count').notNull(),
    low_count: integer('low_count').notNull(),
    open_cases: integer('open_cases').notNull(),
    risk_flag: text('risk_flag').notNull(), // High Risk / Watch / Minor / None
  },
  (t) => [primaryKey({ columns: [t.tenant_id, t.member_id] })],
);

// DS-05 · Promotion Intent — highly sensitive (HR/BOD only).
export const promotionIntent = performanceSchema.table(
  'promotion_intent',
  {
    tenant_id: uuid('tenant_id').notNull(),
    member_id: text('member_id').notNull(),
    current_level: text('current_level').notNull(),
    target_level: text('target_level').notNull(),
    readiness_score: doublePrecision('readiness_score').notNull(), // 0.0–1.0; never public to employee
  },
  (t) => [primaryKey({ columns: [t.tenant_id, t.member_id] })],
);

// DS-06 · Salary Band — sensitive (HR/BOD only). Band only, never a real figure.
export const salaryBand = performanceSchema.table(
  'salary_band',
  {
    tenant_id: uuid('tenant_id').notNull(),
    member_id: text('member_id').notNull(),
    salary_band: text('salary_band').notNull(), // Band A (lowest) → Band F
    effective_date: date('effective_date', { mode: 'string' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenant_id, t.member_id] })],
);

// DS-07 · Performance NORM / Rule-based Standards — the 27-rule engine the agent reads.
export const normRules = performanceSchema.table(
  'norm_rules',
  {
    tenant_id: uuid('tenant_id').notNull(),
    norm_id: text('norm_id').notNull(), // NORM-P01 …
    category: text('category').notNull(), // KPI Score / Timesheet / Resource Allocation / Violation / Composite Risk / Report Guard
    rule_description: text('rule_description').notNull(),
    threshold: text('threshold').notNull(),
    classification_label: text('classification_label').notNull(),
    action_if_triggered: text('action_if_triggered').notNull(),
    priority: text('priority').notNull(), // Critical / High / Medium / Low
    applies_to: text('applies_to').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.norm_id] }),
    index('norm_by_category').on(t.tenant_id, t.category),
  ],
);

// DS-08 · Performance Profile (Aggregated) — derived per-employee snapshot (T3–T4/2026).
export const performanceProfile = performanceSchema.table(
  'performance_profile',
  {
    tenant_id: uuid('tenant_id').notNull(),
    member_id: text('member_id').notNull(),
    avg_score_t3_t4: doublePrecision('avg_score_t3_t4'), // NULL if no data
    classification_latest: text('classification_latest').notNull(),
    ts_compliance_t4: text('ts_compliance_t4').notNull(), // Compliant / Minor Late / Late Pattern / Unapproved Absence / No data
    total_ot_hours_t4: doublePrecision('total_ot_hours_t4').notNull(),
    violation_risk_flag: text('violation_risk_flag').notNull(),
    open_violation_count: integer('open_violation_count').notNull(),
    allocation_status: text('allocation_status').notNull(), // Active / Overloaded / Under-allocated / Bench / Unknown
    readiness_score: doublePrecision('readiness_score'),
    salary_band: text('salary_band'),
    perf_risk_note: text('perf_risk_note').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenant_id, t.member_id] }),
    index('profile_by_risk').on(t.tenant_id, t.violation_risk_flag),
  ],
);

// REF · Project Master — decode account_id / project_id.
export const projectMaster = performanceSchema.table(
  'project_master',
  {
    tenant_id: uuid('tenant_id').notNull(),
    account_id: text('account_id').notNull(),
    account_name: text('account_name').notNull(),
    project_id: text('project_id').notNull(),
    project_name: text('project_name').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenant_id, t.project_id] })],
);
