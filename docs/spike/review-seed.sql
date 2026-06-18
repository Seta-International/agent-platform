-- Seta — People / Hiring / PM review seed (illustrative sample data).
-- Run AFTER review-schema.sql (which drops & recreates the schemas). Fixed UUIDs so cross-module
-- links (worker_id = person.id, resource_request_id, etc.) line up. Shows a re-hire (2 employment
-- periods) and an internal-mobility movement.

-- ids
-- tenant 1111…; personA aaaa0001 (re-hire), personB aaaa0002; account a1; project b1; resource_request c9

-- ---------- people ----------
insert into people.person (id, tenant_id, user_id, original_hire_date, seniority_date) values
  ('aaaa0001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','9999aaaa-0000-0000-0000-000000000001','2021-03-01','2021-03-01'),
  ('aaaa0002-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','9999aaaa-0000-0000-0000-000000000002','2024-09-02','2024-09-02');

-- personA: re-hire → period 1 ended, period 2 open
insert into people.employment_period (tenant_id, person_id, seq, start_date, end_date, status, lifecycle_stage, employment_type) values
  ('11111111-1111-1111-1111-111111111111','aaaa0001-0000-0000-0000-000000000001',1,'2021-03-01','2023-06-30','ended','alumni','full_time'),
  ('11111111-1111-1111-1111-111111111111','aaaa0001-0000-0000-0000-000000000001',2,'2025-01-06',null,'active','active','full_time'),
  ('11111111-1111-1111-1111-111111111111','aaaa0002-0000-0000-0000-000000000002',1,'2024-09-02',null,'active','onboarding','full_time');

insert into people.worker (tenant_id, person_id, full_name, work_email, role_title, department, employment_type, grade, fte, status, lifecycle_stage, location, gender, dob) values
  ('11111111-1111-1111-1111-111111111111','aaaa0001-0000-0000-0000-000000000001','Le Thu Ha','ha.le@seta.vn','Senior Engineer','Delivery','full_time','L5',1.0,'active','active','Hanoi','F','1994-07-12'),
  ('11111111-1111-1111-1111-111111111111','aaaa0002-0000-0000-0000-000000000002','Tran Minh','minh.tran@seta.vn','Engineer','Delivery','full_time','L3',1.0,'onboarding','onboarding','Hanoi','M','1999-02-20');

-- comp history for personA (prior period + current), capacity
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

insert into people.lifecycle_case (tenant_id, person_id, kind, stage, progress, health, started_at) values
  ('11111111-1111-1111-1111-111111111111','aaaa0002-0000-0000-0000-000000000002','onboarding','Day 7',40,'On track',now());

-- internal-mobility movement for personA (source = internal_mobility)
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

-- allocation read-model (drives visibility): personA on project b1 / account a1
insert into people.rm_allocation (tenant_id, worker_id, project_id, account_id, pct, billable, date_from) values
  ('11111111-1111-1111-1111-111111111111','aaaa0001-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',80,true,'2025-01-06');
insert into people.rm_account_project (tenant_id, kind, name, am_worker_id) values
  ('11111111-1111-1111-1111-111111111111','account','Aeris','aaaa0001-0000-0000-0000-000000000001');

-- ---------- hiring ----------
insert into hiring.requisition (id, tenant_id, title, role_title, grade, account_id, resource_request_id, kind, status, stage) values
  ('00000000-0000-0000-0000-00000000d001','11111111-1111-1111-1111-111111111111','Senior Backend Engineer','Senior Engineer','L5','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c9','new','open','interview');
insert into hiring.candidate (id, tenant_id, name, source, stage, seniority, segment) values
  ('00000000-0000-0000-0000-00000000d002','11111111-1111-1111-1111-111111111111','Pham Lan','LinkedIn','interview','Senior',null);
insert into hiring.application (id, tenant_id, requisition_id, worker_id, status, alloc_pct) values
  ('00000000-0000-0000-0000-00000000d003','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000d001','aaaa0001-0000-0000-0000-000000000001','pmo_review',50);
insert into hiring.interview (id, tenant_id, candidate_id, round, mode, status, result, rating, recommendation, scorecard_template_id) values
  ('00000000-0000-0000-0000-00000000d004','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000d002','Technical','online','completed','pass',4,'Hire','00000000-0000-0000-0000-0000000000f1');
insert into hiring.interview_score (interview_id, criterion_id, score, evidence) values
  ('00000000-0000-0000-0000-00000000d004','00000000-0000-0000-0000-0000000000f2',4,'Solid system design');
insert into hiring.offer (id, tenant_id, candidate_id, requisition_id, position_id, respond_by, status, hired_event_id) values
  ('00000000-0000-0000-0000-00000000d005','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000d002','00000000-0000-0000-0000-00000000d001','00000000-0000-0000-0000-0000000000c1','2026-07-15','accepted','00000000-0000-0000-0000-00000000d0a5');
insert into hiring.resource_request_fulfillment (tenant_id, resource_request_id, placeholder_allocation_id, requisition_id, path, state, opened_at, timeout_at) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000c9','00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-00000000d001','undecided','in_progress',now(),now()+interval '30 days');
-- read-models: rm_worker shows an active worker + an alumnus (alumni segment source)
insert into hiring.rm_worker (worker_id, tenant_id, name, stage) values
  ('aaaa0001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Le Thu Ha','active'),
  ('aaaa0099-0000-0000-0000-000000000099','11111111-1111-1111-1111-111111111111','Do Quang (alumnus)','alumni');
insert into hiring.rm_resource_request (resource_request_id, tenant_id, project_id, role, status) values
  ('00000000-0000-0000-0000-0000000000c9','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000b1','Senior Engineer','open');

-- ---------- pm ----------
insert into pm.account (id, tenant_id, name, am_worker_id) values
  ('00000000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','Aeris','aaaa0001-0000-0000-0000-000000000001');
insert into pm.project (id, tenant_id, account_id, name, objective, budget_bmm, phase, status) values
  ('00000000-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000a1','PGE Automotive','OTA platform',24,'delivery','active');
-- placeholder (open seat) + committed allocation
insert into pm.allocation (id, tenant_id, worker_id, project_id, role, date_from, date_to, billable, planned_pct, criteria, resource_request_id, status) values
  ('00000000-0000-0000-0000-00000000e001','11111111-1111-1111-1111-111111111111',null,'00000000-0000-0000-0000-0000000000b1','Senior Engineer','2026-07-01','2026-12-31',true,100,'{"skills":["Kubernetes"]}','00000000-0000-0000-0000-0000000000c9','placeholder'),
  ('00000000-0000-0000-0000-00000000e002','11111111-1111-1111-1111-111111111111','aaaa0001-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b1','Senior Engineer','2025-01-06','2026-12-31',true,80,null,null,'committed');
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
insert into pm.rm_resource_capacity (worker_id, effective_from, fte, contracted_hours) values
  ('aaaa0001-0000-0000-0000-000000000001','2025-01-06',1.0,40);
