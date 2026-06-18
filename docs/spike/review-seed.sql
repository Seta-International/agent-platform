-- Seta — People / Hiring / PM review seed v2 (matches review-schema.sql v2).
-- Run AFTER review-schema.sql. Fixed UUIDs so cross-module links line up.
-- Shows: a re-hire (2 employment periods), an internal-mobility movement, an external candidate
-- application with stage history, normalized skills, and a placeholder + committed allocation.

-- ---------- people ----------
insert into people.person (id, tenant_id, user_id, original_hire_date, seniority_date) values
  ('aaaa0001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','9999aaaa-0000-0000-0000-000000000001','2021-03-01','2021-03-01'),
  ('aaaa0002-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','9999aaaa-0000-0000-0000-000000000002','2024-09-02','2024-09-02');

-- personA re-hire: period 1 ended, period 2 open
insert into people.employment_period (tenant_id, person_id, seq, start_date, end_date, status, lifecycle_stage, employment_type) values
  ('11111111-1111-1111-1111-111111111111','aaaa0001-0000-0000-0000-000000000001',1,'2021-03-01','2023-06-30','ended','alumni','full_time'),
  ('11111111-1111-1111-1111-111111111111','aaaa0001-0000-0000-0000-000000000001',2,'2025-01-06',null,'active','active','full_time'),
  ('11111111-1111-1111-1111-111111111111','aaaa0002-0000-0000-0000-000000000002',1,'2024-09-02',null,'active','onboarding','full_time');

-- worker = person-level mutable directory fields only (domain fields derive via v_worker_directory)
insert into people.worker (tenant_id, person_id, full_name, work_email, location, gender, dob, phone) values
  ('11111111-1111-1111-1111-111111111111','aaaa0001-0000-0000-0000-000000000001','Le Thu Ha','ha.le@seta.vn','Hanoi','F','1994-07-12','+84-900-000-001'),
  ('11111111-1111-1111-1111-111111111111','aaaa0002-0000-0000-0000-000000000002','Tran Minh','minh.tran@seta.vn','Hanoi','M','1999-02-20','+84-900-000-002');

insert into people.worker_compensation (tenant_id, person_id, effective_from, effective_to, salary_amount, salary_currency, reason) values
  ('11111111-1111-1111-1111-111111111111','aaaa0001-0000-0000-0000-000000000001','2021-03-01','2023-06-30',3000.00,'USD','initial hire'),
  ('11111111-1111-1111-1111-111111111111','aaaa0001-0000-0000-0000-000000000001','2025-01-06',null,4500.00,'USD','re-hire'),
  ('11111111-1111-1111-1111-111111111111','aaaa0002-0000-0000-0000-000000000002','2024-09-02',null,1800.00,'USD','initial hire');
insert into people.worker_capacity (tenant_id, person_id, effective_from, fte, contracted_hours) values
  ('11111111-1111-1111-1111-111111111111','aaaa0001-0000-0000-0000-000000000001','2025-01-06',1.0,40),
  ('11111111-1111-1111-1111-111111111111','aaaa0002-0000-0000-0000-000000000002','2024-09-02',1.0,40);

insert into people.skill (id, tenant_id, name, category) values
  ('00000000-0000-0000-0000-0000000000e1','11111111-1111-1111-1111-111111111111','JavaScript','Frontend'),
  ('00000000-0000-0000-0000-0000000000e2','11111111-1111-1111-1111-111111111111','Kubernetes','DevOps');
insert into people.worker_skill (person_id, skill_id, proficiency, years_experience) values
  ('aaaa0001-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1',5,6),
  ('aaaa0001-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e2',3,2),
  ('aaaa0002-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000e1',2,1);

insert into people.org_unit (id, tenant_id, name) values
  ('00000000-0000-0000-0000-0000000000c1','11111111-1111-1111-1111-111111111111','Delivery');
insert into people.position (tenant_id, org_unit_id, role_title, grade, headcount_status, holder_worker_id) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000c1','Senior Engineer','L5','filled','aaaa0001-0000-0000-0000-000000000001'),
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000c1','Engineer','L3','open',null);

insert into people.account_access_grant (tenant_id, grantee_user_id, account_id, granted_by) values
  ('11111111-1111-1111-1111-111111111111','9999bbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','9999cccc-0000-0000-0000-000000000001');

insert into people.lifecycle_case (id, tenant_id, person_id, kind, stage, progress, health, started_at) values
  ('00000000-0000-0000-0000-0000000000c5','11111111-1111-1111-1111-111111111111','aaaa0002-0000-0000-0000-000000000002','onboarding','Day 7',40,'On track',now());

insert into people.movement_request (id, tenant_id, person_id, type, source, to_position_id, to_grade, effective_date, status) values
  ('00000000-0000-0000-0000-00000000aa01','11111111-1111-1111-1111-111111111111','aaaa0001-0000-0000-0000-000000000001','transfer','internal_mobility','00000000-0000-0000-0000-0000000000c1','L5','2026-07-01','hr_approval');
insert into people.movement_step (request_id, seq, name, status, approver_user_id) values
  ('00000000-0000-0000-0000-00000000aa01',1,'Manager approval','done','9999cccc-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-00000000aa01',2,'HR approval','doing',null);

insert into people.scorecard_template (id, tenant_id, name, version, status) values
  ('00000000-0000-0000-0000-0000000000f1','11111111-1111-1111-1111-111111111111','Engineering Scorecard',1,'active');
insert into people.scorecard_criterion (id, tenant_id, template_id, pillar, criterion, weight, is_core) values
  ('00000000-0000-0000-0000-0000000000f2','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000f1','Delivery','Code quality',0.4,true);
insert into people.review_cycle (id, tenant_id, period, template_id, status) values
  ('00000000-0000-0000-0000-0000000000f3','11111111-1111-1111-1111-111111111111','2026-H1','00000000-0000-0000-0000-0000000000f1','open');
insert into people.review (id, tenant_id, cycle_id, person_id, reviewer_type, template_id, total, verdict) values
  ('00000000-0000-0000-0000-0000000000f4','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000f3','aaaa0001-0000-0000-0000-000000000001','self','00000000-0000-0000-0000-0000000000f1',4.2,'meets');
insert into people.review_score (review_id, criterion_id, score, evidence) values
  ('00000000-0000-0000-0000-0000000000f4','00000000-0000-0000-0000-0000000000f2',4,'Shipped the PGE release with low defect rate');

insert into people.probation_review (tenant_id, person_id, marker, outcome) values
  ('11111111-1111-1111-1111-111111111111','aaaa0002-0000-0000-0000-000000000002','1mo','pending');
insert into people.headcount_plan (tenant_id, org_unit_id, period, planned_count) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000c1','2026-Q1',8);
insert into people.document_requirement (tenant_id, scope, employment_type, doc_type, mandatory) values
  ('11111111-1111-1111-1111-111111111111','tenant',null,'signed_contract',true);
insert into people.employee_document (tenant_id, person_id, doc_type, storage_key) values
  ('11111111-1111-1111-1111-111111111111','aaaa0001-0000-0000-0000-000000000001','signed_contract','s3://docs/ha-contract.pdf');

insert into people.rm_allocation (tenant_id, allocation_id, worker_id, project_id, account_id, pct, bucket, date_from) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000e002','aaaa0001-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',80,'billable','2025-01-06');
insert into people.rm_account_project (tenant_id, kind, name, am_worker_id) values
  ('11111111-1111-1111-1111-111111111111','account','Aeris','aaaa0001-0000-0000-0000-000000000001');

-- ---------- hiring ----------
insert into hiring.requisition (id, tenant_id, title, role_title, grade, account_id, resource_request_id, position_id, kind, status, stage, owner_user_id) values
  ('00000000-0000-0000-0000-00000000d001','11111111-1111-1111-1111-111111111111','Senior Backend Engineer','Senior Engineer','L5','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c9','00000000-0000-0000-0000-0000000000c1','new','open','interview','9999dddd-0000-0000-0000-000000000001');
insert into hiring.requisition_skill (requisition_id, skill_name, min_level) values
  ('00000000-0000-0000-0000-00000000d001','Kubernetes',3),
  ('00000000-0000-0000-0000-00000000d001','JavaScript',3);

insert into hiring.candidate (id, tenant_id, name, source, seniority, segment) values
  ('00000000-0000-0000-0000-00000000d002','11111111-1111-1111-1111-111111111111','Pham Lan','LinkedIn','Senior',null);
insert into hiring.candidate_skill (candidate_id, skill_name, proficiency) values
  ('00000000-0000-0000-0000-00000000d002','Kubernetes',4);

-- external application (Pham Lan -> the req) + internal mobility application (personA -> the req)
insert into hiring.application (id, tenant_id, requisition_id, kind, candidate_id, worker_id, stage, status, rating) values
  ('00000000-0000-0000-0000-00000000d007','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000d001','external','00000000-0000-0000-0000-00000000d002',null,'interview',null,4),
  ('00000000-0000-0000-0000-00000000d003','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000d001','internal',null,'aaaa0001-0000-0000-0000-000000000001',null,'pmo_review',null);
insert into hiring.candidate_event (application_id, from_stage, to_stage, actor) values
  ('00000000-0000-0000-0000-00000000d007','new','screening','9999dddd-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-00000000d007','screening','interview','9999dddd-0000-0000-0000-000000000001');
insert into hiring.application_event (application_id, actor, action) values
  ('00000000-0000-0000-0000-00000000d003','9999cccc-0000-0000-0000-000000000001','releasing_endorsed');

insert into hiring.interview (id, tenant_id, application_id, round, at, dtstart, dtend, tzid, ical_uid, mode, status, result, rating, recommendation, scorecard_template_id) values
  ('00000000-0000-0000-0000-00000000d004','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000d007','Technical','2026-06-20 10:00+07','2026-06-20 10:00+07','2026-06-20 11:00+07','Asia/Ho_Chi_Minh','iv-d004@seta','online','completed','pass',4,'Hire','00000000-0000-0000-0000-0000000000f1');
insert into hiring.interview_panelist (interview_id, panelist_user_id) values
  ('00000000-0000-0000-0000-00000000d004','aaaa0001-0000-0000-0000-000000000001');
insert into hiring.interview_score (interview_id, criterion_id, score, evidence) values
  ('00000000-0000-0000-0000-00000000d004','00000000-0000-0000-0000-0000000000f2',4,'Solid system design');

insert into hiring.offer (id, tenant_id, application_id, candidate_id, respond_by, status, hired_event_id) values
  ('00000000-0000-0000-0000-00000000d005','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000d007','00000000-0000-0000-0000-00000000d002','2026-07-15','accepted','00000000-0000-0000-0000-00000000d0a5');

insert into hiring.resource_request_fulfillment (tenant_id, resource_request_id, placeholder_allocation_id, requisition_id, path, state, opened_at, timeout_at) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000c9','00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-00000000d001','undecided','in_progress',now(),now()+interval '30 days');

insert into hiring.recruiter_account_assignment (recruiter_user_id, account_id, tenant_id) values
  ('9999dddd-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111');

insert into hiring.kb_failure_theme (id, tenant_id, label, reject_count, pct, improvement_action, owner, priority) values
  ('00000000-0000-0000-0000-00000000fb01','11111111-1111-1111-1111-111111111111','Kubernetes & infra depth',4,0.33,'Add a hands-on k8s + incident scenario','TA Lead + Eng Manager','High');

insert into hiring.rm_worker (worker_id, tenant_id, name, stage) values
  ('aaaa0001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Le Thu Ha','active'),
  ('aaaa0099-0000-0000-0000-000000000099','11111111-1111-1111-1111-111111111111','Do Quang (alumnus)','alumni');
insert into hiring.rm_worker_skill (worker_id, skill_name, proficiency) values
  ('aaaa0001-0000-0000-0000-000000000001','JavaScript',5),
  ('aaaa0001-0000-0000-0000-000000000001','Kubernetes',3);
insert into hiring.rm_resource_request (resource_request_id, tenant_id, project_id, role, status) values
  ('00000000-0000-0000-0000-0000000000c9','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000b1','Senior Engineer','open');

-- ---------- pm ----------
insert into pm.account (id, tenant_id, name, am_worker_id) values
  ('00000000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','Aeris','aaaa0001-0000-0000-0000-000000000001');
insert into pm.project (id, tenant_id, account_id, name, objective, budget_bmm, phase, status) values
  ('00000000-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000a1','PGE Automotive','OTA platform',24,'delivery','active');
insert into pm.allocation (id, tenant_id, worker_id, project_id, role, date_from, date_to, bucket, planned_pct, resource_request_id, status) values
  ('00000000-0000-0000-0000-00000000e001','11111111-1111-1111-1111-111111111111',null,'00000000-0000-0000-0000-0000000000b1','Senior Engineer','2026-07-01','2026-12-31','billable',100,'00000000-0000-0000-0000-0000000000c9','placeholder'),
  ('00000000-0000-0000-0000-00000000e002','11111111-1111-1111-1111-111111111111','aaaa0001-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1','Senior Engineer','2025-01-06','2026-12-31','billable',80,null,'committed');
insert into pm.allocation_skill (allocation_id, skill_name, min_level) values
  ('00000000-0000-0000-0000-00000000e001','Kubernetes',3);
insert into pm.rate (tenant_id, role, cost_rate, bill_rate, effective_from) values
  ('11111111-1111-1111-1111-111111111111','Senior Engineer',35.0,75.0,'2025-01-01');
insert into pm.weekly_report (id, tenant_id, project_id, week, summary, rag, action, owner, date) values
  ('00000000-0000-0000-0000-00000000f0a1','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000b1','2026-W-21','May release deployed; OTA retry failures','Yellow','Deploy hotfix','Giang Le Thanh','2026-05-25');
insert into pm.weekly_report_qcdp (weekly_report_id, dimension, rag, note) values
  ('00000000-0000-0000-0000-00000000f0a1','quality','Yellow','Leakage 75%'),
  ('00000000-0000-0000-0000-00000000f0a1','delivery','Green','On time');
insert into pm.kpi_metric (id, tenant_id, code, name, unit, category, direction) values
  ('00000000-0000-0000-0000-00000000f0b1','11111111-1111-1111-1111-111111111111','LR','Leakage Rate','%','quality','down');
insert into pm.kpi_threshold (tenant_id, scope, metric_id, goal, yellow) values
  ('11111111-1111-1111-1111-111111111111','tenant','00000000-0000-0000-0000-00000000f0b1',0.1,0.3);
insert into pm.kpi_value (tenant_id, project_id, metric_id, period, value) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000f0b1','2026-05',0.75);
insert into pm.rm_resource (worker_id, tenant_id, name, availability) values
  ('aaaa0001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Le Thu Ha','{"on_leave":[]}');
insert into pm.rm_resource_skill (worker_id, skill_name, proficiency) values
  ('aaaa0001-0000-0000-0000-000000000001','JavaScript',5);
insert into pm.rm_resource_capacity (worker_id, effective_from, fte, contracted_hours) values
  ('aaaa0001-0000-0000-0000-000000000001','2025-01-06',1.0,40);
insert into pm.rm_utilization (worker_id, period, capacity, util_pct, overallocated, billable_pct, internal_pct, bench_pct, leave_pct) values
  ('aaaa0001-0000-0000-0000-000000000001','2026-05',1.0,0.85,false,0.80,0.05,0.0,0.0);

-- ---------- v3 demo: directory projection, lifecycle steps, calendar sync ----------
insert into people.rm_worker_directory (person_id, tenant_id, full_name, work_email, lifecycle_stage, status, grade, fte, department, role_title, account_id) values
  ('aaaa0001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Le Thu Ha','ha.le@seta.vn','active','active','L5',1.0,'Delivery','Senior Engineer','00000000-0000-0000-0000-0000000000a1'),
  ('aaaa0002-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Tran Minh','minh.tran@seta.vn','onboarding','active',null,1.0,null,null,null);

insert into people.lifecycle_case_step (tenant_id, case_id, template_step_key, phase, responsible_role, status, started_at, done_at) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000c5','it_provision','onboarding day','IT','done','2026-06-15 09:00+07','2026-06-15 15:00+07'),
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000c5','team_intro','post onboard','Team Lead','doing','2026-06-16 09:00+07',null);

insert into integrations.external_calendar_link (tenant_id, calendar_event_id, provider, external_event_id, ical_uid, etag_or_changekey, sequence, sync_status) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000d004','msgraph','AAMkAGI2...graphid','iv-d004@seta','W/"CQAAABYAAAA"',0,'idle');
insert into integrations.calendar_sync_state (tenant_id, provider, account_ref, delta_link, channel_expiry) values
  ('11111111-1111-1111-1111-111111111111','msgraph','recruiting@seta.vn','https://graph.microsoft.com/v1.0/...$deltatoken=abc', now()+interval '6 days');
