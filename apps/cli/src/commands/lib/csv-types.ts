export interface UserCsvRow {
  user_id: string;
  name: string;
  email: string;
  project: string;
  role: string;
  rbac_role: string;
  skills: string;
  bio: string;
  availability_status: string;
  timezone: string;
  working_hours_start: string;
  working_hours_end: string;
}

export interface GroupCsvRow {
  group_id: string;
  name: string;
  description: string;
  theme: string;
}

export interface PlanCsvRow {
  plan_id: string;
  group_id: string;
  title: string;
  description: string;
  tags: string;
  owner: string;
}

export interface BucketCsvRow {
  bucket_id: string;
  plan_id: string;
  name: string;
}

export interface PlanMemberCsvRow {
  plan_id: string;
  member_id: string;
}

export interface TaskCsvRow {
  task_id: string;
  plan_id: string;
  bucket_id: string;
  assignee_ids: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string;
  tags: string;
  checklist: string;
  comments: string;
  attachments: string;
}

export interface TimesheetCsvRow {
  leave_id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  type: string;
  status: string;
}

export interface ParsedCsvs {
  users: UserCsvRow[];
  groups: GroupCsvRow[];
  plans: PlanCsvRow[];
  buckets: BucketCsvRow[];
  planMembers: PlanMemberCsvRow[];
  tasks: TaskCsvRow[];
  timesheet: TimesheetCsvRow[];
}
