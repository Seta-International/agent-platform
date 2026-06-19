# Performance Dashboards API

Three endpoints feed the ARIA (employee performance) dashboards. Each is gated by a `performance.dashboard.*` permission. The module is `performance`; "ARIA" is the display alias only.

---

## Open dependencies

Two schema gaps must be resolved before these endpoints can be implemented. The spec documents them here rather than hiding them.

### 1. Identity → `member_id` mapping

`performance.employee_master` is keyed on `(tenant_id, member_id)` where `member_id` is tenant-local text (e.g. `"EMP-001"`). There is no `user_id` or `email` column — cross-schema FKs are forbidden by architecture (CLAUDE.md §4). The session provides a `user_id` (UUID from `identity.user`), not a `member_id`.

Before `/me` or `/team` can be implemented, a mapping must exist. Two options:

| Option | Description |
|---|---|
| **A — mapping table** | Add a `performance.identity_link` table `(tenant_id, user_id uuid, member_id text)`. Populated by HR import. No cross-schema FK, consistent with the pattern. |
| **B — member_id in employee_master** | Add an `identity_user_id uuid` column to `employee_master`, nullable, set during HR import. Simpler for point-lookups. |

Until resolved, `/me` and `/team` **cannot** scope to the calling user. The mock frontend works around this with a hardcoded `SELF_ID = 'EMP-001'`. The chosen option requires a new `db:generate` + migration in `packages/performance`.

### 2. Free-text manager feedback

The `/me` response includes `feedback_current` / `feedback_prev` (free-text strings visible on the Overview dashboard). The real `performance.performance_by_project` table has only `feedback_category: text` (a label like `"Attendance"`) — no prose feedback column. The mock data's `feedback` / `feedback_prev` fields are richer than the schema.

Options:

| Option | Description |
|---|---|
| **A — new column** | Add `reviewer_comment text` to `performance_by_project`. Populated by HR import. |
| **B — separate table** | `performance.reviewer_feedback (tenant_id, member_id, report_period, comment text)`. Allows multiple comments per period. |

Until resolved, `feedback_current` and `feedback_prev` are marked `// SCHEMA GAP` in the response shape below.

---

## Conventions

### Base URL

```
/api/performance/v1
```

### Authentication

All endpoints require a valid session cookie (`better-auth` session). The server extracts `user_id`, `tenant_id`, and `permissions` from `c.get('user')`. Unauthenticated requests receive `401`.

### RBAC enforcement

| Role | Permission granted | Dashboard access |
|---|---|---|
| `performance.employee` | `performance.dashboard.read` | `/me` only |
| `performance.manager` | `performance.dashboard.read`, `performance.dashboard.team.read` | `/me`, `/team` |
| `performance.bod` | `performance.dashboard.read`, `performance.dashboard.team.read`, `performance.dashboard.executive.read` | `/me`, `/team`, `/org` |

A request missing the required permission returns:

```json
HTTP 403
{ "error": "forbidden" }
```

### Time period filtering

The data model's native grain is a **review period** (`report_period` column, `YYYY-MM` text). There are no intra-month timestamps — day and week presets from the frontend UI map to the current month's period. The mapping from the UI `TimePreset` type to API params is:

| UI preset | `from_period` | `to_period` |
|---|---|---|
| `day` | current `YYYY-MM` | current `YYYY-MM` |
| `week` | current `YYYY-MM` | current `YYYY-MM` |
| `month` | specific `YYYY-MM` | same `YYYY-MM` |
| `quarter` | first month of quarter | current `YYYY-MM` |

Both parameters are optional. When omitted, the server returns data for the **two most recent periods** present in `performance.performance_by_project` for the calling tenant.

### Error shape

All error responses follow:

```json
{ "error": "<snake_case_code>" }
```

With Zod validation failures:

```json
{ "error": "invalid_payload", "issues": [ /* zod issues */ ] }
```

### Data sensitivity

- `readiness_score` (promotion intent) is never included in the `/me` response — it is a manager/BOD signal only.
- `salary_band` is never sent to any dashboard endpoint.
- Violation *details* (category, consequence, description) are never sent. Dashboards receive only `risk_flag` (enum) and `open_violations` (integer count).
- The `/org` endpoint never includes individual member records — only pre-aggregated counts and distributions.

---

## Endpoints

### `GET /api/performance/v1/dashboard/me`

Personal performance overview. Available to any authenticated user with `performance.dashboard.read`.

**Query parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `from_period` | `YYYY-MM` | no | Start of period range (inclusive) |
| `to_period` | `YYYY-MM` | no | End of period range (inclusive) |

**Response `200`**

```ts
{
  // — Profile (from performance.employee_master + performance.resource_allocation) —
  member_id: string;            // e.g. "EMP-001"
  role_title: string;
  department: string;
  level: string;                // L1 (intern) → L7 (C-level)
  employment_status: string;    // "Active" | "Probation" | "On Leave" | "Resigned" | "PIP"
  account_id: string;           // e.g. "ACC-A"
  account_name: string;         // resolved from performance.project_master
  allocation_status: string;    // "Active" | "Overloaded" | "Bench" | "Unknown"
  performance_tier: string;     // "Exceeds Expectations" | "Meets Expectations" | "Partially Meets" | "Does Not Meet"
  classification_latest: string; // "Excellent" | "Good" | "Meets Expectations" | "Below" | "Poor"

  // — KPIs (from performance.performance_by_project for requested periods) —
  avg_score_latest: number;     // 0–5 score in to_period
  avg_score_prev: number | null; // score in the period before to_period (for MoM delta)
  mom_delta: number | null;     // avg_score_latest − avg_score_prev

  // — Dept context (requires scanning all active peers in same department) —
  dept_avg_score: number;
  dept_rank: number;            // 1-based rank (1 = highest score)
  dept_headcount: number;       // active peers in same department
  dept_percentile: number;      // 0–100, integer

  // — Timesheet (from performance.timesheet for to_period) —
  ot_hours_latest: number;      // total_ot_hours in to_period
  ts_compliance: string;        // "Compliant" | "Minor Late" | "Late Pattern" | "Unapproved Absence" | "No data"

  // — Risk & compliance (from performance.violation_summary + performance.performance_profile) —
  risk_flag: string;            // "None" | "Minor" | "Watch" | "High"
  open_violations: number;
  perf_risk_note: string;       // human-readable rule-engine note

  // — Score trend (one entry per period in [from_period, to_period]) —
  trend: Array<{
    period: string;             // YYYY-MM
    score: number;
    dept_avg: number;
  }>;

  // — Manager feedback —
  // SCHEMA GAP: performance_by_project has `feedback_category` (label only, e.g. "Attendance").
  // Free-text prose requires a new column or table — see Open dependencies §2.
  feedback_category_current: string | null;   // e.g. "Attendance" — available now
  feedback_current: string | null;            // reviewer prose for to_period — requires schema addition
  feedback_prev: string | null;               // reviewer prose for the period before to_period — requires schema addition
}
```

**Errors**

| Status | `error` | Condition |
|---|---|---|
| 401 | `unauthorized` | No valid session |
| 403 | `forbidden` | Missing `performance.dashboard.read` |
| 404 | `member_not_found` | No `employee_master` row for the resolved `member_id` (requires identity→member mapping — see Open dependencies §1) |

---

### `GET /api/performance/v1/dashboard/team`

Manager view of the caller's direct reports. Requires `performance.dashboard.team.read`. The server scopes results to employees whose `report_to` matches the calling user's `member_id` in `performance.resource_allocation`. Resolving the calling user's `member_id` requires the identity→member mapping (see Open dependencies §1).

**Query parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `from_period` | `YYYY-MM` | no | Start of period range (inclusive) |
| `to_period` | `YYYY-MM` | no | End of period range (inclusive) |

**Response `200`**

```ts
{
  // — Aggregate KPIs (over all direct reports, for to_period) —
  kpis: {
    active_count: number;
    avg_score: number;            // mean avg_score_latest across team
    high_risk_count: number;      // risk_flag === "High"
    watch_count: number;          // risk_flag === "Watch"
    declining_count: number;      // mom_delta < 0
    overloaded_count: number;     // allocation_status === "Overloaded"
    bench_count: number;          // allocation_status === "Bench"
  };

  // — Talent-risk quadrant (readiness vs score scatter) —
  // Readiness is sourced from performance.promotion_intent.readiness_score (0.0–1.0).
  // Managers may see readiness for their own direct reports only.
  talent_quadrant: Array<{
    member_id: string;
    role_title: string;
    avg_score: number;            // 0–5
    readiness: number;            // 0–1
    risk_flag: string;            // "None" | "Minor" | "Watch" | "High"
    allocation_status: string;
  }>;

  // — Department score breakdown (avg per department, all active staff under manager) —
  dept_scores: Array<{
    department: string;
    avg_score: number;
    headcount: number;
  }>;

  // — Allocation distribution (for pie chart) —
  allocation_distribution: {
    active: number;
    bench: number;
    overloaded: number;
  };

  // — At-risk roster (risk_flag "High" or "Watch", sorted by risk desc then score asc, max 12) —
  at_risk: Array<{
    member_id: string;
    role_title: string;
    department: string;
    avg_score: number;
    risk_flag: string;
    perf_risk_note: string;
    ts_compliance: string;
    allocation_status: string;
  }>;
}
```

**Errors**

| Status | `error` | Condition |
|---|---|---|
| 401 | `unauthorized` | No valid session |
| 403 | `forbidden` | Missing `performance.dashboard.team.read` |
| 404 | `member_not_found` | Caller has no `employee_master` row for the resolved `member_id` (requires Open dependencies §1) |

---

### `GET /api/performance/v1/dashboard/org`

Executive / board view of the whole organisation. Requires `performance.dashboard.executive.read`. Returns only pre-aggregated data — no individual member records.

**Query parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `from_period` | `YYYY-MM` | no | Start of period range (inclusive) |
| `to_period` | `YYYY-MM` | no | End of period range (inclusive) |

**Response `200`**

```ts
{
  // — Organisation KPIs (all active employees, for to_period) —
  kpis: {
    workforce_count: number;       // employment_status === "Active"
    avg_score: number;
    talent_health_pct: number;     // % with avg_score ≥ 3.5 (SCORE_THRESHOLDS.good)
    at_risk_count: number;         // risk_flag "High" | "Watch"
    promotion_ready_count: number; // readiness_score ≥ 0.8 (performance.promotion_intent)
    utilization_pct: number;       // % with allocation_status === "Active" (not Bench/Overloaded)
  };

  // — Score distribution histogram (buckets of width 1.0) —
  score_histogram: Array<{
    bucket: string;    // "0–1" | "1–2" | "2–3" | "3–4" | "4–5"
    count: number;
  }>;

  // — Performance tier distribution —
  tier_distribution: Array<{
    tier: string;    // "Exceeds Expectations" | "Meets Expectations" | "Partially Meets" | "Does Not Meet"
    count: number;
    pct: number;     // 0–100, integer
  }>;

  // — Account-level summary (per account_id, sorted by headcount desc) —
  account_summary: Array<{
    account_id: string;
    account_name: string;         // resolved from performance.project_master
    headcount: number;
    avg_score: number;
    health_pct: number;           // % with avg_score ≥ 3.5
    risk_count: number;           // risk_flag "High" | "Watch"
    status: string;               // "Healthy" | "Watch" | "At Risk" — derived from health_pct thresholds
  }>;
}
```

**Account status derivation**

| `health_pct` | `status` |
|---|---|
| ≥ 70% | `"Healthy"` |
| 40–69% | `"Watch"` |
| < 40% | `"At Risk"` |

**Errors**

| Status | `error` | Condition |
|---|---|---|
| 401 | `unauthorized` | No valid session |
| 403 | `forbidden` | Missing `performance.dashboard.executive.read` |

---

## Data sources reference

| Dashboard section | Primary table(s) |
|---|---|
| Employee profile | `performance.employee_master`, `performance.resource_allocation` |
| Score / trend | `performance.performance_by_project` (one row per `member_id × report_period`) |
| Timesheet compliance | `performance.timesheet` (one row per `member_id × report_period`) |
| Risk flag, compliance note | `performance.violation_summary`, `performance.performance_profile` |
| Promotion readiness | `performance.promotion_intent` (manager/BOD only) |
| Account name | `performance.project_master` |
| Org-wide aggregates | Computed over `performance.employee_master` JOIN `performance.performance_profile` |
| Feedback prose | **Schema gap** — `performance_by_project.feedback_category` is a label only; see Open dependencies §2 |
| Identity → member mapping | **Schema gap** — no `user_id` column in performance schema; see Open dependencies §1 |

All tables are tenant-scoped via `tenant_id`. Queries always include `WHERE tenant_id = $tenant_id` from the session.

---

## Implementing a route

Follow the `registerMeRoute` pattern in `apps/server/src/routes/me.ts`:

```ts
import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';

export function registerPerformanceDashboardRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/performance/v1/dashboard/me', async (c) => {
    const { permissions, tenant_id, user_id } = c.get('user');
    if (!permissions.has('performance.dashboard.read')) {
      return c.json({ error: 'forbidden' }, 403);
    }
    // ... query performance.* tables scoped to tenant_id
    return c.json({ /* see response shape above */ });
  });

  app.get('/api/performance/v1/dashboard/team', async (c) => {
    const { permissions, tenant_id } = c.get('user');
    if (!permissions.has('performance.dashboard.team.read')) {
      return c.json({ error: 'forbidden' }, 403);
    }
    // ...
  });

  app.get('/api/performance/v1/dashboard/org', async (c) => {
    const { permissions, tenant_id } = c.get('user');
    if (!permissions.has('performance.dashboard.executive.read')) {
      return c.json({ error: 'forbidden' }, 403);
    }
    // ...
  });
}
```

Register the function in `apps/server/src/build.ts` alongside the other `register*Route` calls.

---

## Period query helper

The frontend's `TimePreset` maps to `from_period` / `to_period` as follows. Implement this in the frontend client before making the API call:

```ts
function presetToPeriods(preset: TimePreset, anchor: Date): { from_period: string; to_period: string } {
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const to = fmt(anchor);
  if (preset === 'day' || preset === 'week' || preset === 'month') {
    return { from_period: to, to_period: to };
  }
  // quarter: include the 3 months of the current quarter
  const q = Math.floor(anchor.getMonth() / 3);
  const from = fmt(new Date(anchor.getFullYear(), q * 3, 1));
  return { from_period: from, to_period: to };
}
```
