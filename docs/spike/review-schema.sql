-- Seta — People / Hiring / PM review schema
-- Source: docs/spike/db-design.md + ddd-design.md (2026-06-18 revision) + the module technical specs.
-- Purpose: a STANDALONE review database for DBeaver inspection. Hand-authored DDL, NOT the
--          production Drizzle migrations. No cross-schema FKs (cross-module links are plain uuids).

drop schema if exists people cascade;
drop schema if exists hiring cascade;
drop schema if exists pm cascade;

create schema people;
create schema hiring;
create schema pm;

-- =====================================================================================
-- people  (HR / Workforce system-of-record)
-- =====================================================================================

-- person identity persists across re-hires; 1..N employment periods
create table people.person (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid,                                  -- identity link (no FK)
  original_hire_date date,                       -- immutable
  seniority_date date
);
create index person_user on people.person (tenant_id, user_id);

create table people.employment_period (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid not null references people.person(id),
  seq int not null,
  start_date date not null,
  end_date date,                                 -- null = open period
  status text not null,
  lifecycle_stage text not null,                 -- preboarding|onboarding|probation|active|offboarding|alumni
  employment_type text
);
-- INVARIANT: at most one open period per person (re-hire = new period, never a duplicate person)
create unique index employment_period_one_open on people.employment_period (person_id) where end_date is null;

-- current-state view of the person's open period (directory/edit aggregate)
create table people.worker (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid not null unique references people.person(id),
  full_name text not null,
  work_email text not null,
  role_title text,
  department text,
  employment_type text,
  grade text,                                    -- cached (authoritative chain elsewhere)
  fte numeric,                                   -- cached
  status text,
  lifecycle_stage text,
  location text,
  gender text,
  dob date,
  phone text,
  emergency_contact jsonb,
  profile_completed_at timestamptz,
  joined_at date,
  offboarded_at date,
  version int not null default 1,
  deleted_at timestamptz
);
create index worker_status on people.worker (tenant_id, status);
create index worker_stage  on people.worker (tenant_id, lifecycle_stage);

create table people.worker_compensation (             -- effective-dated, sensitive (RLS-eligible)
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid not null references people.person(id),
  effective_from date not null,
  effective_to date,                             -- null = current
  salary_amount numeric(14,2),
  salary_currency text,
  bank jsonb,
  tax jsonb,
  reason text,
  by_user_id uuid,
  unique (person_id, effective_from)
);

create table people.worker_capacity (                 -- effective-dated FTE / contracted hours
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid not null references people.person(id),
  effective_from date not null,
  effective_to date,
  fte numeric,
  contracted_hours int,
  unique (person_id, effective_from)
);

create table people.skill (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  category text,
  unique (tenant_id, name)
);

create table people.worker_skill (
  person_id uuid not null references people.person(id),
  skill_id uuid not null references people.skill(id),
  proficiency smallint check (proficiency between 0 and 5),
  years_experience numeric,
  primary key (person_id, skill_id)
);

create table people.org_unit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  parent_id uuid references people.org_unit(id),
  name text not null,
  manager_position_id uuid
);
create index org_unit_parent on people.org_unit (tenant_id, parent_id);

create table people.position (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  org_unit_id uuid not null references people.org_unit(id),
  role_title text,
  grade text,
  headcount_status text not null check (headcount_status in ('open','filled')),
  holder_worker_id uuid,                         -- = person.id (no FK)
  check (headcount_status = 'open' or holder_worker_id is not null)   -- filled => one holder
);
create index position_unit on people.position (tenant_id, org_unit_id, headcount_status);

create table people.account_access_grant (            -- F-SEC-4: AM cross-account grant
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  grantee_user_id uuid not null,
  account_id uuid not null,
  granted_by uuid not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table people.worker_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid not null references people.person(id),
  at timestamptz not null default now(),
  action text, field text, from_val text, to_val text, by_user_id uuid
);

create table people.lifecycle_template_step (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  template_id uuid not null,
  step_key text not null,                        -- stable id stamped on planner checklist item
  phase text, responsible_role text, sla_hours int, seq int
);

create table people.lifecycle_case (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid not null references people.person(id),
  kind text not null check (kind in ('onboarding','offboarding')),
  planner_plan_id uuid,
  planner_task_id uuid,
  stage text,
  progress smallint,
  health text,
  leaver_type text check (leaver_type in ('voluntary','involuntary')),
  held boolean not null default false,
  prior_stage text,                              -- resume target on hold/cancel
  sla_due_at timestamptz,
  started_at timestamptz
);
create index lifecycle_case_kind on people.lifecycle_case (tenant_id, kind, stage);

create table people.scorecard_template (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  version int not null,
  status text check (status in ('draft','active','archived')),
  unique (tenant_id, name, version)
);

create table people.scorecard_criterion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  template_id uuid not null references people.scorecard_template(id),
  pillar text, criterion text, weight numeric,
  is_core boolean, auto_from_ammi boolean, ammi_dim text
);

create table people.review_cycle (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  period text,
  template_id uuid references people.scorecard_template(id),
  scope jsonb,
  status text check (status in ('open','closed'))
);

create table people.goal (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  cycle_id uuid references people.review_cycle(id),
  person_id uuid references people.person(id),
  objective text, key_results jsonb, weight numeric, progress numeric
);

create table people.review (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  cycle_id uuid references people.review_cycle(id),
  person_id uuid references people.person(id),
  reviewer_user_id uuid,
  reviewer_type text check (reviewer_type in ('self','manager','peer')),
  template_id uuid references people.scorecard_template(id),  -- pinned (immutable)
  ammi jsonb, total numeric, verdict text, strengths text, improve text, action text
);

create table people.review_score (
  review_id uuid not null references people.review(id),
  criterion_id uuid not null references people.scorecard_criterion(id),
  score smallint, evidence text,
  primary key (review_id, criterion_id)
);

create table people.probation_review (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid not null references people.person(id),
  marker text check (marker in ('1mo','2mo','confirmation')),
  scorecard_review_id uuid references people.review(id),
  outcome text check (outcome in ('pass','fail','extend','pending')),
  extension_until date,
  decided_at timestamptz
);

create table people.movement_request (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid not null references people.person(id),
  type text check (type in ('promotion','transfer','pay')),   -- org move = transfer rebinding to_position_id
  source text not null check (source in ('hr_initiated','internal_mobility')),
  to_position_id uuid,
  to_grade text,
  salary_from numeric(14,2),
  salary_to numeric(14,2),
  effective_date date,
  status text,
  applied_at timestamptz                          -- once-only apply guard
);

create table people.movement_step (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references people.movement_request(id),
  seq int, name text, status text, approver_user_id uuid, decided_at timestamptz
);

create table people.headcount_plan (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  org_unit_id uuid not null references people.org_unit(id),
  period text, planned_count int, notes text
);

create table people.employee_document (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid not null references people.person(id),
  doc_type text,
  storage_key text,
  expiry_date date,
  supersedes_id uuid references people.employee_document(id),
  uploaded_by uuid,
  at timestamptz not null default now()
);

create table people.document_requirement (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  scope text,                                    -- tenant | employment_type
  doc_type text,
  mandatory boolean
);

-- NOTE: leave_* tables REMOVED (2026-06-18) — leave owned by the timesheet system; people proxies its API.

-- read-models (ACL, projected from pm)
create table people.rm_allocation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  allocation_id uuid,
  worker_id uuid not null,                       -- = person.id
  project_id uuid,
  account_id uuid,                               -- drives RBAC visibility
  pct numeric,
  billable boolean,
  date_from date,
  date_to date
);
create index rm_alloc_worker  on people.rm_allocation (tenant_id, worker_id);
create index rm_alloc_account on people.rm_allocation (tenant_id, account_id);
create index rm_alloc_project on people.rm_allocation (tenant_id, project_id);

create table people.rm_account_project (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  kind text, name text, parent_account_id uuid, am_worker_id uuid
);

-- =====================================================================================
-- hiring  (Recruitment / ATS)
-- =====================================================================================

create table hiring.requisition (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  title text, role_title text, grade text,
  account_id uuid,
  resource_request_id uuid,
  position_id uuid,
  kind text check (kind in ('replacement','new')),
  status text check (status in ('open','on_hold','filled','cancelled')),
  stage text check (stage in ('sourcing','screening','interview','offer')),
  skills jsonb, jd jsonb,
  owner_user_id uuid,
  start_date date, due_date date, closed_at timestamptz,
  unique (tenant_id, resource_request_id)        -- auto-author dedupe (one req per demand)
);
create index req_status on hiring.requisition (tenant_id, status, stage);

create table hiring.candidate (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text, source text, contact jsonb, dob date, gender text,
  cv_storage_key text,
  status text,
  stage text check (stage in ('new','screening','interview','offer','hired','rejected')),
  skills jsonb, seniority text,
  segment text,                                  -- incl. alumni
  reject_reason text, tags jsonb, source_cost numeric
);

create table hiring.application (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  requisition_id uuid not null references hiring.requisition(id),
  worker_id uuid,                                -- internal applicant (= person.id)
  status text check (status in ('submitted','releasing_endorsed','receiving_endorsed','pmo_review','approved','rejected','withdrawn')),
  alloc_pct numeric,
  override_overallocation boolean,
  mobility_event_id uuid,                        -- emitted-once guard
  note text
);
create index app_req on hiring.application (tenant_id, requisition_id, status);

create table hiring.application_event (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references hiring.application(id),
  at timestamptz not null default now(),
  actor uuid, action text, note text
);

create table hiring.interview (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  candidate_id uuid references hiring.candidate(id),
  application_id uuid references hiring.application(id),
  round text, panel jsonb, at timestamptz, duration_min int,
  mode text check (mode in ('online','onsite')),
  meeting_link text,
  status text check (status in ('scheduled','completed','cancelled','no_show')),
  result text check (result in ('pass','hold','fail')),
  rating smallint, recommendation text, feedback text, transcript text,
  scorecard_template_id uuid,                    -- pinned people template by id (no FK)
  scorecard_snapshot jsonb                       -- immutable copy of template + criteria
);
create index iv_at on hiring.interview (tenant_id, at);

create table hiring.interview_score (
  interview_id uuid not null references hiring.interview(id),
  criterion_id uuid not null,                    -- people criterion by id (no FK)
  score smallint, evidence text,
  primary key (interview_id, criterion_id)
);

create table hiring.offer (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  candidate_id uuid not null references hiring.candidate(id),
  requisition_id uuid references hiring.requisition(id),
  position_id uuid,
  comp jsonb, start_date date, respond_by date,
  status text check (status in ('draft','approved','sent','accepted','declined','expired')),
  offer_letter_key text,
  hired_event_id uuid                            -- fire-once guard
);
create unique index offer_one_accepted on hiring.offer (tenant_id, candidate_id) where status = 'accepted';

create table hiring.resource_request_fulfillment (    -- the one-seat fulfillment saga
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  resource_request_id uuid not null,
  placeholder_allocation_id uuid,
  requisition_id uuid,
  path text check (path in ('internal','external','undecided')),
  state text check (state in ('open','in_progress','filled','cancelled','timed_out')),
  opened_at timestamptz, closed_at timestamptz, timeout_at timestamptz,
  unique (tenant_id, resource_request_id)
);

create table hiring.kb_article (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  type text, title text, body text, tags jsonb
);

-- read-models (ACL)
create table hiring.rm_worker (
  worker_id uuid primary key,                    -- = person.id (also the person-match source)
  tenant_id uuid not null,
  name text, skills jsonb, current_positions jsonb,
  stage text                                     -- alumni stage seeds the alumni segment
);
create table hiring.rm_resource_request (
  resource_request_id uuid primary key,
  tenant_id uuid not null,
  project_id uuid, role text, skills jsonb, date_from date, date_to date, status text
);
create table hiring.rm_scorecard_template (
  template_id uuid primary key,
  tenant_id uuid not null,
  name text, version int, status text
);
create table hiring.rm_scorecard_criterion (
  id uuid primary key,
  template_id uuid not null,
  pillar text, criterion text, weight numeric, is_core boolean, auto_from_ammi boolean, ammi_dim text
);
create table hiring.rm_account_project (
  id uuid primary key,
  tenant_id uuid not null,
  kind text, name text, parent_account_id uuid, am_worker_id uuid
);

-- =====================================================================================
-- pm  (Delivery / PSA)
-- =====================================================================================

create table pm.account (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text, am_worker_id uuid
);

create table pm.project (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_id uuid not null references pm.account(id),
  name text, objective text, scope jsonb, budget_bmm numeric,
  pm_worker_id uuid, phase text, status text, planner_group_id uuid
);
create index project_acc on pm.project (tenant_id, account_id, status);

create table pm.project_request (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text, account_id uuid, objective text, scope jsonb, budget_bmm numeric, pm_worker_id uuid,
  stage text check (stage in ('submitted','pmo_review','bod_review','created')),
  rejected_at timestamptz
);

create table pm.allocation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  worker_id uuid,                                -- null => placeholder/demand (exactly one seat)
  project_id uuid not null references pm.project(id),
  task_id uuid,
  role text, date_from date, date_to date, billable boolean,
  planned_pct numeric(5,2),
  minutes_per_day int, weekday_mask int,         -- recurrence rule
  criteria jsonb,                                -- placeholder role/skills (no count)
  resource_request_id uuid,
  status text check (status in ('placeholder','committed')),
  deleted_at timestamptz,
  check (status <> 'committed' or worker_id is not null)   -- committed => worker_id not null
);
create index alloc_proj   on pm.allocation (tenant_id, project_id);
create index alloc_worker on pm.allocation (tenant_id, worker_id);
create index alloc_open   on pm.allocation (tenant_id) where worker_id is null;   -- open demand

create table pm.allocation_day_override (
  allocation_id uuid not null references pm.allocation(id),
  date date not null,
  minutes int,
  primary key (allocation_id, date)
);

create table pm.rate (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  role text, worker_id uuid, project_id uuid, phase text,      -- typed scope, exactly one set
  cost_rate numeric, bill_rate numeric,
  effective_from date, effective_to date,
  check ( (role is not null)::int + (worker_id is not null)::int
        + (project_id is not null)::int + (phase is not null)::int = 1 )
);

create table pm.weekly_report (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references pm.project(id),
  week text, summary text, risk text, rag text, action text, owner text,
  date date, by_user_id uuid, submitted_at timestamptz
);

create table pm.weekly_report_qcdp (
  weekly_report_id uuid not null references pm.weekly_report(id),
  dimension text check (dimension in ('quality','cost','delivery','process')),
  rag text, note text,
  primary key (weekly_report_id, dimension)
);

create table pm.risk (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references pm.project(id),
  title text, type text, severity text, priority text, status text, owner text, due text, action text
);

create table pm.kpi_metric (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  code text, name text, unit text,
  category text check (category in ('quality','cost','delivery','process')),
  direction text,
  unique (tenant_id, code)
);

create table pm.kpi_threshold (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  scope text,
  metric_id uuid references pm.kpi_metric(id),
  goal numeric, yellow numeric
);

create table pm.kpi_value (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid,
  metric_id uuid references pm.kpi_metric(id),
  period text, value numeric
);

-- read-models (ACL + derived)
create table pm.rm_resource (
  worker_id uuid primary key,
  tenant_id uuid not null,
  name text, skills jsonb,
  availability jsonb                             -- from the TIMESHEET system now (not people.leave)
);
create table pm.rm_resource_capacity (
  worker_id uuid not null,
  effective_from date not null,
  effective_to date,
  fte numeric, contracted_hours int,
  primary key (worker_id, effective_from)
);
create table pm.rm_effective_rate (
  worker_id uuid, project_id uuid, date date, cost_rate numeric, bill_rate numeric
);
create table pm.rm_utilization (
  worker_id uuid, period text, allocated numeric, capacity numeric, util_pct numeric, overallocated boolean
);
create table pm.rm_project_health (
  project_id uuid, qcdp jsonb, rag text, predictability numeric
);
create table pm.rm_margin (
  project_id uuid, cost numeric, bill numeric, margin numeric
);
