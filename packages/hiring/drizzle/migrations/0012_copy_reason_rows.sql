-- hand-written: copy two reference tables' rows into the merged reason table; Drizzle cannot express INSERT..SELECT.
INSERT INTO hiring.reason (id, tenant_id, kind, label, category, active, version, created_at, updated_at)
SELECT id, tenant_id, 'opening_close', label, NULL, active, version, created_at, updated_at
FROM hiring.opening_close_reason;

INSERT INTO hiring.reason (id, tenant_id, kind, label, category, active, version, created_at, updated_at)
SELECT id, tenant_id, 'rejection', label, category, active, version, created_at, updated_at
FROM hiring.rejection_reason;
