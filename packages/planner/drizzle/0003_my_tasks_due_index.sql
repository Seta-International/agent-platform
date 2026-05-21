-- hand-written: power-user listMyTasks needs (user_id, assigned_at) for cursor pagination
CREATE INDEX task_assignments_by_user_due
  ON planner.task_assignments (user_id, assigned_at);

-- hand-written: My-Tasks within-plan ordering reads on (tenant_id, assignee_priority)
CREATE INDEX tasks_by_assignee_priority
  ON planner.tasks (tenant_id, assignee_priority)
  WHERE deleted_at IS NULL;
