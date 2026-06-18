-- Seta — People / Hiring / PM review schema (v2: post adversarial PRD/3NF/DDD challenge)
-- Source: db-design.md + ddd-design.md (2026-06-18) + module technical specs, hardened by the
--         three-lens review. Standalone review DB for DBeaver. Hand-authored, NOT Drizzle migrations.
-- No cross-schema FKs (cross-module links are plain uuids).
--
-- v2 changes: missing invariants added (rm_allocation/rate/employment_period/position uniques,
-- org_unit acyclicity trigger, one-open-placeholder-per-request); worker split into person-level
-- columns + a derived directory view (no cached SoR drift); matched-skills normalized to child
-- tables; unified application (external candidate × requisition + internal mobility); candidate_event,
-- recruiter_account_assignment, kb failure-theme tables; 4-way utilization bucket; CHECK enums; GIN
-- directory index.

create extension if not exists pg_trgm;
create extension if not exists btree_gist;   -- v3: temporal EXCLUDE (scalar = + range &&)

drop schema if exists people cascade;
drop schema if exists hiring cascade;
drop schema if exists pm cascade;
drop schema if exists core cascade;
drop schema if exists integrations cascade;
create schema people;
create schema hiring;
create schema pm;
create schema core;          -- v3: outbox + generic audit
create schema integrations;  -- v3: external calendar sync mapping

-- =====================================================================================
-- people
-- =====================================================================================

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
  end_date date,
  status text not null check (status in ('active','ended')),
  lifecycle_stage text not null
    check (lifecycle_stage in ('preboarding','onboarding','probation','active','offboarding','alumni')),
  employment_type text,
  unique (person_id, seq)
);
create unique index employment_period_one_open on people.employment_period (person_id) where end_date is null;

-- person-level mutable directory fields ONLY (derived domain fields live in v_worker_directory)
create table people.worker (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid not null unique references people.person(id),
  full_name text not null,
  work_email text not null,
  location text,
  gender text,
  dob date,
  phone text,
  emergency_contact jsonb,                       -- opaque (justified)
  profile_completed_at timestamptz,
  version int not null default 1,
  deleted_at timestamptz
);
create index worker_search on people.worker using gin (full_name gin_trgm_ops, work_email gin_trgm_ops);

create table people.worker_compensation (             -- effective-dated, sensitive (RLS-eligible)
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid not null references people.person(id),
  effective_from date not null,
  effective_to date,
  salary_amount numeric(14,2),
  salary_currency text,
  bank jsonb, tax jsonb,                          -- opaque sensitive (justified)
  reason text, by_user_id uuid,
  unique (person_id, effective_from),
  -- v3: prevent OVERLAPPING comp periods (unique(effective_from) was insufficient)
  exclude using gist (tenant_id with =, person_id with =,
                      daterange(effective_from, effective_to, '[)') with &&)
);

create table people.worker_capacity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid not null references people.person(id),
  effective_from date not null,
  effective_to date,
  fte numeric, contracted_hours int,
  reason text, by_user_id uuid,                  -- v3: symmetry with comp (who/why)
  unique (person_id, effective_from),
  exclude using gist (tenant_id with =, person_id with =,
                      daterange(effective_from, effective_to, '[)') with &&)
);

create table people.skill (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null, category text,
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
-- DB-native acyclicity guard (was "domain-checked" only)
create or replace function people.org_unit_no_cycle() returns trigger language plpgsql as $$
begin
  if new.parent_id is not null and exists (
    with recursive up as (
      select new.parent_id as id
      union all
      select o.parent_id from people.org_unit o join up on o.id = up.id where o.parent_id is not null
    ) select 1 from up where id = new.id
  ) then
    raise exception 'org_unit cycle detected: % -> %', new.id, new.parent_id;
  end if;
  return new;
end $$;
create trigger org_unit_no_cycle_trg before insert or update on people.org_unit
  for each row execute function people.org_unit_no_cycle();

create table people.position (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  org_unit_id uuid not null references people.org_unit(id),
  role_title text, grade text,
  headcount_status text not null check (headcount_status in ('open','filled')),
  holder_worker_id uuid,                          -- = person.id (no FK)
  check (headcount_status = 'open' or holder_worker_id is not null)
);
create index position_unit on people.position (tenant_id, org_unit_id, headcount_status);
-- one worker holds at most one position (the reverse of the one-holder invariant)
create unique index position_one_per_holder on people.position (tenant_id, holder_worker_id) where holder_worker_id is not null;

create table people.account_access_grant (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  grantee_user_id uuid not null,
  account_id uuid not null,
  granted_by uuid not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz, revoked_by uuid         -- v3: revoke audit (F-SEC-4)
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
  template_id uuid not null, step_key text not null,
  phase text, responsible_role text, sla_hours int, seq int
);

create table people.lifecycle_case (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid not null references people.person(id),
  kind text not null check (kind in ('onboarding','offboarding')),
  planner_plan_id uuid, planner_task_id uuid,
  stage text, progress smallint,
  health text check (health in ('On track','At risk','Blocked','Overdue','Complete')),
  leaver_type text check (leaver_type in ('voluntary','involuntary')),
  held boolean not null default false,
  prior_stage text,
  sla_due_at timestamptz, started_at timestamptz
);
create index lifecycle_case_kind on people.lifecycle_case (tenant_id, kind, stage);

create table people.scorecard_template (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null, version int not null,
  status text check (status in ('draft','active','archived')),
  unique (tenant_id, name, version)
);
create table people.scorecard_criterion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  template_id uuid not null references people.scorecard_template(id),
  pillar text, criterion text, weight numeric, is_core boolean, auto_from_ammi boolean, ammi_dim text,
  unique (template_id, criterion)
);
create table people.review_cycle (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  period text, starts_at date, seq int,          -- v3: deterministic prev-period ordering
  template_id uuid references people.scorecard_template(id),
  scope jsonb, status text check (status in ('open','closed'))
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
  template_id uuid references people.scorecard_template(id),
  ammi jsonb, total numeric, verdict text, strengths text, improve text, action text
);
create table people.review_score (
  review_id uuid not null references people.review(id),
  criterion_id uuid not null references people.scorecard_criterion(id),
  score smallint, evidence text,
  top_action text,                               -- v3: Action-Plan rule (<4 needs a top action)
  primary key (review_id, criterion_id),
  -- v3: Evidence rule — an extreme score (1 or 5) requires written evidence (F-PERF-1)
  constraint review_score_evidence_on_extreme check (score is null or score not in (1,5) or evidence is not null),
  constraint review_score_action_below_4 check (score is null or score >= 4 or top_action is not null)
);

create table people.probation_review (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid not null references people.person(id),
  marker text check (marker in ('1mo','2mo','confirmation')),
  scorecard_review_id uuid references people.review(id),
  outcome text check (outcome in ('pass','fail','extend','pending')),
  extension_until date, decided_at timestamptz, decided_by uuid   -- v3: who decided (F-PROB-2)
);

create table people.movement_request (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  person_id uuid not null references people.person(id),
  type text check (type in ('promotion','transfer','pay')),
  source text not null check (source in ('hr_initiated','internal_mobility')),
  to_position_id uuid, to_grade text,
  salary_from numeric(14,2), salary_to numeric(14,2),
  effective_date date,
  status text check (status in ('requested','leader_review','manager_approval','hr_approval','effective','completed','rejected')),
  applied_at timestamptz,
  decided_by uuid, rejected_reason text           -- v3: terminal outcome audit (F-MOVE-2, QA-37)
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
  doc_type text, storage_key text, expiry_date date,
  supersedes_id uuid references people.employee_document(id),
  uploaded_by uuid, at timestamptz not null default now()
);
create table people.document_requirement (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  scope text check (scope in ('tenant','employment_type')),
  employment_type text,                          -- bound when scope='employment_type'
  doc_type text, mandatory boolean
);

-- NOTE: leave_* tables REMOVED — leave owned by the timesheet system.

-- read-models (ACL, projected from pm)
create table people.rm_allocation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  allocation_id uuid not null,
  worker_id uuid not null,                        -- = person.id
  project_id uuid, account_id uuid,
  pct numeric,
  bucket text check (bucket in ('billable','internal','bench')),
  date_from date, date_to date,
  unique (tenant_id, allocation_id)               -- idempotent projection (no double-count)
);
create index rm_alloc_worker  on people.rm_allocation (tenant_id, worker_id);
create index rm_alloc_account on people.rm_allocation (tenant_id, account_id);
create index rm_alloc_project on people.rm_allocation (tenant_id, project_id);

create table people.rm_account_project (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  kind text, name text, parent_account_id uuid, am_worker_id uuid
);

-- v3: the directory is an EVENT-MAINTAINED projection table (people.rm_worker_directory), NOT a
-- live 5-table-join view — see the v3 section at the end (fixes the measured 117ms/22k-buffer read).

-- =====================================================================================
-- hiring
-- =====================================================================================

create table hiring.requisition (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  title text, role_title text, grade text,       -- snapshot of position (cross-schema, no FK)
  account_id uuid, resource_request_id uuid, position_id uuid,
  kind text check (kind in ('replacement','new')),
  status text check (status in ('open','on_hold','filled','cancelled')),
  stage text check (stage in ('sourcing','screening','interview','offer')),
  jd jsonb,                                       -- prose (justified)
  owner_user_id uuid,                             -- the recruiter
  start_date date, due_date date, closed_at timestamptz,
  unique (tenant_id, resource_request_id)
);
create index req_status on hiring.requisition (tenant_id, status, stage);
create table hiring.requisition_skill (              -- normalized (was requisition.skills jsonb)
  requisition_id uuid not null references hiring.requisition(id),
  skill_id uuid, skill_name text not null, min_level smallint,
  primary key (requisition_id, skill_name)
);

create table hiring.candidate (                       -- the PERSON (no per-role stage here)
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text, source text, contact jsonb, dob date, gender text,
  cv_storage_key text, seniority text,
  segment text,                                   -- incl. alumni
  source_cost numeric
);
create table hiring.candidate_skill (                 -- normalized (was candidate.skills jsonb)
  candidate_id uuid not null references hiring.candidate(id),
  skill_id uuid, skill_name text not null, proficiency smallint,
  primary key (candidate_id, skill_name)
);

-- UNIFIED application: a person's pursuit of one requisition (external candidate OR internal worker)
create table hiring.application (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  requisition_id uuid not null references hiring.requisition(id),
  kind text not null check (kind in ('external','internal')),
  candidate_id uuid references hiring.candidate(id),   -- external
  worker_id uuid,                                      -- internal (= person.id, no FK)
  stage text check (stage in ('new','screening','interview','offer','hired','rejected')),  -- external pipeline
  status text,                                         -- internal endorsement: submitted|releasing_endorsed|receiving_endorsed|pmo_review|approved|rejected|withdrawn
  rating smallint,
  alloc_pct numeric, override_overallocation boolean, mobility_event_id uuid,
  reject_reason text, tags jsonb, note text,
  check ( (candidate_id is not null)::int + (worker_id is not null)::int = 1 )
);
create unique index application_ext_uniq on hiring.application (requisition_id, candidate_id) where candidate_id is not null;
create unique index application_int_uniq on hiring.application (requisition_id, worker_id)   where worker_id is not null;
create index app_req on hiring.application (tenant_id, requisition_id);

create table hiring.candidate_event (                 -- external pipeline stage history (funnel/leadtime/timeline)
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references hiring.application(id),
  at timestamptz not null default now(),
  from_stage text, to_stage text, actor uuid, note text
);

create table hiring.application_event (               -- internal endorsement history
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references hiring.application(id),
  at timestamptz not null default now(),
  actor uuid, action text, note text
);

create table hiring.interview (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  application_id uuid not null references hiring.application(id),
  round text, at timestamptz, duration_min int,
  -- v3: RFC 5545 (iCalendar) shape so events round-trip to Teams/Graph + Google Calendar
  dtstart timestamptz, dtend timestamptz, tzid text,   -- IANA tz, e.g. 'Asia/Ho_Chi_Minh'
  rrule text, exdate timestamptz[], rdate timestamptz[],
  ical_uid text,                                  -- OUR stable RFC 5545 UID (identity hub; NOT Graph's per-occurrence iCalUId)
  mode text check (mode in ('online','onsite')),
  meeting_link text,                              -- provider joinUrl (Teams/Meet) via integrations
  status text check (status in ('scheduled','completed','cancelled','no_show')),
  no_show_reason text,                            -- v3 (F-INT-3, QA-38)
  result text check (result in ('pass','hold','fail')),
  rating smallint, recommendation text, feedback text, transcript text,
  scorecard_template_id uuid,                     -- pinned people template by id (no FK)
  scorecard_snapshot jsonb                        -- immutable copy
);
create table hiring.calendar_event_override (     -- v3: per-instance RECURRENCE-ID overrides
  interview_id uuid not null references hiring.interview(id),
  recurrence_id timestamptz not null,             -- the ORIGINAL instant of the overridden occurrence
  new_dtstart timestamptz, new_dtend timestamptz, is_cancelled boolean not null default false,
  primary key (interview_id, recurrence_id)
);
create index iv_at on hiring.interview (tenant_id, at);
create table hiring.interview_panelist (             -- normalized (was interview.panel jsonb)
  interview_id uuid not null references hiring.interview(id),
  panelist_user_id uuid not null,
  primary key (interview_id, panelist_user_id)
);
create table hiring.interview_score (
  interview_id uuid not null references hiring.interview(id),
  criterion_id uuid not null,                     -- people criterion by id (no FK)
  score smallint, evidence text,
  primary key (interview_id, criterion_id),
  constraint interview_score_evidence_on_extreme check (score is null or score not in (1,5) or evidence is not null)
);

create table hiring.offer (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  application_id uuid not null references hiring.application(id),
  candidate_id uuid not null references hiring.candidate(id),  -- for the one-accepted-per-person rule
  comp jsonb, start_date date, respond_by date,
  status text check (status in ('draft','approved','sent','accepted','declined','expired')),
  offer_letter_key text, hired_event_id uuid,
  decided_at timestamptz, decided_by uuid         -- v3: offer decision audit (F-OFFER-2, F-SEC-2)
);
create unique index offer_one_accepted on hiring.offer (tenant_id, candidate_id) where status = 'accepted';

create table hiring.resource_request_fulfillment (
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
create unique index fulfillment_one_placeholder on hiring.resource_request_fulfillment (tenant_id, placeholder_allocation_id) where placeholder_allocation_id is not null;

create table hiring.recruiter_account_assignment (   -- recruiter visibility scope (by assignment)
  recruiter_user_id uuid not null,
  account_id uuid not null,
  tenant_id uuid not null,
  primary key (recruiter_user_id, account_id)
);

-- recruitment insight (structured, was a single freetext kb_article)
create table hiring.kb_failure_theme (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  label text, reject_count int, pct numeric,
  improvement_action text, owner text,
  priority text check (priority in ('High','Medium','Low'))
);
create table hiring.kb_theme_case (
  theme_id uuid not null references hiring.kb_failure_theme(id),
  application_id uuid references hiring.application(id),
  candidate_name text, role text, reason text,
  primary key (theme_id, candidate_name)
);
create table hiring.kb_article (                      -- optional prose playbooks (OQ-1)
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, type text, title text, body text, tags jsonb
);

-- read-models (ACL)
create table hiring.rm_worker (
  worker_id uuid primary key,                     -- = person.id (person-match source)
  tenant_id uuid not null,
  name text, current_positions jsonb, stage text  -- alumni stage seeds the alumni segment
);
create table hiring.rm_worker_skill (                -- normalized matched skills (was rm_worker.skills jsonb)
  worker_id uuid not null, skill_name text not null, proficiency smallint,
  primary key (worker_id, skill_name)
);
create table hiring.rm_resource_request (
  resource_request_id uuid primary key,
  tenant_id uuid not null,
  project_id uuid, role text, skills jsonb, date_from date, date_to date, status text
);
create table hiring.rm_scorecard_template (
  template_id uuid primary key, tenant_id uuid not null, name text, version int, status text
);
create table hiring.rm_scorecard_criterion (
  id uuid primary key, template_id uuid not null,
  pillar text, criterion text, weight numeric, is_core boolean, auto_from_ammi boolean, ammi_dim text
);
create table hiring.rm_account_project (
  id uuid primary key, tenant_id uuid not null,
  kind text, name text, parent_account_id uuid, am_worker_id uuid
);

-- =====================================================================================
-- pm
-- =====================================================================================

create table pm.account (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, name text, am_worker_id uuid
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
  worker_id uuid,                                 -- null => placeholder/demand (one seat)
  project_id uuid not null references pm.project(id),
  task_id uuid, role text, date_from date, date_to date,
  bucket text check (bucket in ('billable','internal','bench')),   -- 4-way split (leave from timesheet)
  planned_pct numeric(5,2),
  minutes_per_day int, weekday_mask int,
  resource_request_id uuid,
  status text check (status in ('placeholder','committed')),
  deleted_at timestamptz,
  check (status <> 'committed' or worker_id is not null)
);
create index alloc_proj   on pm.allocation (tenant_id, project_id);
create index alloc_worker on pm.allocation (tenant_id, worker_id);
create index alloc_open   on pm.allocation (tenant_id) where worker_id is null;
-- one open placeholder (seat) per resource request
create unique index alloc_one_placeholder on pm.allocation (resource_request_id)
  where status = 'placeholder' and deleted_at is null and resource_request_id is not null;
create table pm.allocation_skill (                    -- normalized (was allocation.criteria.skills jsonb)
  allocation_id uuid not null references pm.allocation(id),
  skill_name text not null, min_level smallint,
  primary key (allocation_id, skill_name)
);
create table pm.allocation_day_override (
  allocation_id uuid not null references pm.allocation(id),
  date date not null, minutes int,
  primary key (allocation_id, date)
);

create table pm.rate (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  role text, worker_id uuid, project_id uuid, phase text,
  cost_rate numeric, bill_rate numeric,
  effective_from date, effective_to date,
  check ( (role is not null)::int + (worker_id is not null)::int
        + (project_id is not null)::int + (phase is not null)::int = 1 ),
  unique nulls not distinct (tenant_id, role, worker_id, project_id, phase, effective_from),
  -- v3: no overlapping rate periods for the same scope (NULL scope cols don't conflict)
  exclude using gist (tenant_id with =, role with =, worker_id with =, project_id with =, phase with =,
                      daterange(effective_from, effective_to, '[)') with &&)
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
  tenant_id uuid not null, code text, name text, unit text,
  category text check (category in ('quality','cost','delivery','process')),
  direction text, unique (tenant_id, code)
);
create table pm.kpi_threshold (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, scope text,
  metric_id uuid references pm.kpi_metric(id), goal numeric, yellow numeric
);
create table pm.kpi_value (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, project_id uuid,
  metric_id uuid references pm.kpi_metric(id), period text, value numeric
);

-- read-models (ACL + derived)
create table pm.rm_resource (
  worker_id uuid primary key, tenant_id uuid not null,
  name text, availability jsonb                   -- from the TIMESHEET system (not people.leave)
);
create table pm.rm_resource_skill (
  worker_id uuid not null, skill_name text not null, proficiency smallint,
  primary key (worker_id, skill_name)
);
create table pm.rm_resource_capacity (
  worker_id uuid not null, effective_from date not null, effective_to date,
  fte numeric, contracted_hours int,
  primary key (worker_id, effective_from)
);
create table pm.rm_effective_rate (
  worker_id uuid, project_id uuid, date date, cost_rate numeric, bill_rate numeric
);
create table pm.rm_utilization (                      -- 4-way split for F-ALLOC-2
  worker_id uuid, period text,
  capacity numeric, util_pct numeric, overallocated boolean,
  billable_pct numeric, internal_pct numeric, bench_pct numeric, leave_pct numeric,
  primary key (worker_id, period)
);
create table pm.rm_project_health (
  project_id uuid primary key, qcdp jsonb, rag text, predictability numeric
);
create table pm.rm_margin (
  project_id uuid primary key, cost numeric, bill numeric, margin numeric
);

-- =====================================================================================
-- v3 additions (post research + adversarial challenge)
-- =====================================================================================

-- core: transactional outbox (intent) + GENERIC audit log (who/what/when, field-level)
create table core.events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  aggregate_type text, aggregate_id uuid,
  event_type text not null,                       -- <module>.<aggregate>.<verb>
  payload jsonb, actor_id uuid,
  occurred_at timestamptz not null default now(), published_at timestamptz
);
create index events_unpublished on core.events (occurred_at) where published_at is null;
create index events_brin on core.events using brin (occurred_at);
create index events_aggregate on core.events (tenant_id, aggregate_type, aggregate_id);

create table core.audit_log (                       -- supa_audit shape; jsonb so one table covers all
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(), txid bigint not null default txid_current(),
  op text not null, table_oid oid not null, table_schema text not null, table_name text not null,
  record_id uuid, tenant_id uuid, actor_id uuid, old_record jsonb, record jsonb
);
create index audit_brin on core.audit_log using brin (ts);
create index audit_lookup on core.audit_log (table_oid, record_id);
create index audit_tenant on core.audit_log (tenant_id, ts);
revoke update, delete on core.audit_log from public;   -- append-only / tamper-evident

create or replace function core.audit_trigger() returns trigger language plpgsql as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  oldrec jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
begin
  insert into core.audit_log (op, table_oid, table_schema, table_name, record_id, tenant_id, actor_id, old_record, record)
  values (tg_op, tg_relid, tg_table_schema, tg_table_name, (rec->>'id')::uuid, (rec->>'tenant_id')::uuid,
          nullif(current_setting('app.current_user_id', true),'')::uuid,
          oldrec, case when tg_op='DELETE' then null else rec end);
  return case when tg_op='DELETE' then old else new end;
end $$;
do $$
declare t text;
begin
  foreach t in array array[
    'people.worker','people.worker_compensation','people.worker_capacity','people.employment_period',
    'people.position','people.movement_request','people.probation_review','people.account_access_grant',
    'hiring.requisition','hiring.application','hiring.offer','hiring.interview',
    'pm.allocation','pm.rate','pm.project'
  ] loop
    execute format('create trigger %I_audit after insert or update or delete on %s for each row execute function core.audit_trigger()',
                   replace(t,'.','_'), t);
  end loop;
end $$;

-- integrations: external calendar sync mapping (internal id is the identity hub, NOT iCalUID)
create table integrations.external_calendar_link (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  calendar_event_id uuid not null,                -- ref hiring.interview.id (no cross-schema FK)
  provider text not null check (provider in ('msgraph','google')),
  external_event_id text,                          -- Graph/Google immutable event id
  ical_uid text,                                   -- portable on Google; informational for Graph
  etag_or_changekey text, sequence int,
  last_synced_snapshot jsonb,
  sync_status text check (sync_status in ('idle','pulling','pushing','error','conflict')),
  last_error text, unlinked_at timestamptz
);
create unique index ext_cal_one_active on integrations.external_calendar_link (tenant_id, calendar_event_id, provider) where unlinked_at is null;
create unique index ext_cal_provider_id on integrations.external_calendar_link (tenant_id, provider, external_event_id) where unlinked_at is null;

create table integrations.calendar_sync_state (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  provider text not null check (provider in ('msgraph','google')),
  account_ref text,                                -- mailbox / calendar id
  sync_token text, delta_link text,                -- Google syncToken / Graph deltaLink
  channel_expiry timestamptz,                      -- webhook subscription expiry (renew before)
  unique (tenant_id, provider, account_ref)
);

-- per-case lifecycle step instances (step-duration timeline; F-LIFE-3 "avg time in IT-provisioning")
create table people.lifecycle_case_step (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  case_id uuid not null references people.lifecycle_case(id),
  template_step_key text,                          -- correlates to lifecycle_template_step.step_key
  phase text, responsible_role text,
  status text check (status in ('todo','doing','done','blocked')),
  sla_due_at timestamptz, started_at timestamptz, done_at timestamptz,
  unique (case_id, template_step_key)
);
create index lifecycle_case_step_case on people.lifecycle_case_step (case_id);

-- EVENT-MAINTAINED directory projection (replaces the v_worker_directory live view)
create table people.rm_worker_directory (
  person_id uuid primary key,                      -- = worker_id
  tenant_id uuid not null,
  full_name text, work_email text,
  lifecycle_stage text, status text,
  grade text, fte numeric, department text, role_title text,
  account_id uuid,                                 -- primary account for scope filtering
  updated_at timestamptz not null default now()
);
create index rmwd_filter on people.rm_worker_directory (tenant_id, lifecycle_stage, full_name);  -- LIMIT pushdown
create index rmwd_account on people.rm_worker_directory (tenant_id, account_id);
create index rmwd_search on people.rm_worker_directory using gin (full_name gin_trgm_ops, work_email gin_trgm_ops);

-- workforce analytics projection (F-ANALYTICS-1)
create table people.rm_workforce_metrics (
  tenant_id uuid not null, scope text, scope_id uuid, period text,
  headcount int, attrition_pct numeric, bench_pct numeric, avg_tenure_months numeric,
  skill_coverage jsonb, updated_at timestamptz default now(),
  primary key (tenant_id, scope, scope_id, period)
);

-- v3 hot-path indexes (from the read/write review)
create index worker_tenant on people.worker (tenant_id) where deleted_at is null;
create index ep_stage on people.employment_period (tenant_id, lifecycle_stage) where end_date is null;
create index worker_skill_by_skill on people.worker_skill (skill_id);
create index candidate_event_app on hiring.candidate_event (application_id, at);
create index candidate_skill_by_skill on hiring.candidate_skill (skill_name);
create index application_stage on hiring.application (tenant_id, stage);
create index lifecycle_attention on people.lifecycle_case (tenant_id, health, sla_due_at) where health in ('Overdue','Blocked');
create index offer_expiry on hiring.offer (respond_by) where status in ('sent','approved');
create index fulfillment_timeout on hiring.resource_request_fulfillment (timeout_at) where state in ('open','in_progress');
create index requisition_due on hiring.requisition (tenant_id, status, due_date);
create index requisition_owner on hiring.requisition (tenant_id, owner_user_id);
create index weekly_report_latest on pm.weekly_report (tenant_id, project_id, date desc);
create index kpi_value_agg on pm.kpi_value (project_id, period, metric_id);
create index rm_effrate_lookup on pm.rm_effective_rate (worker_id, project_id, date);
create index rm_worker_stage on hiring.rm_worker (tenant_id, stage);
create index interview_upcoming on hiring.interview (tenant_id, at) where status = 'scheduled';

-- BRIN on append-only, time-ordered tables (cheap; defer range partitioning to pg_partman at RAM-scale)
create index worker_history_brin on people.worker_history using brin (at);
create index candidate_event_brin on hiring.candidate_event using brin (at);
create index application_event_brin on hiring.application_event using brin (at);
