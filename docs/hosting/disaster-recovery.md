# Disaster Recovery

This runbook covers backup, restore, and recovery objectives for the Seta platform.

## Recovery objectives

- **RTO** (Recovery Time Objective): 1 hour.
- **RPO** (Recovery Point Objective): 5 minutes.

These targets assume Aurora point-in-time recovery (PITR) is enabled with the default 35-day retention.

## What is backed up

| Asset | Mechanism | Retention |
|------|-----------|-----------|
| Postgres data | Aurora automated backups + PITR | 35 days (default; tunable) |
| S3 knowledge uploads | Bucket versioning + lifecycle rule | 90 days for old versions |
| Secrets | AWS Secrets Manager versioning | 100 versions per secret |
| Container images | ECR immutable tags + cross-region replication | indefinite |

## Restore procedure (full cluster)

1. Identify the target restore time: latest known-good or the moment before the incident.
2. From the Aurora console (or `aws rds restore-db-cluster-to-point-in-time`), create a new cluster restored to that timestamp. Name it `<env>-restore-<timestamp>`.
3. Wait for status `available` (~15 min for typical clusters).
4. Update the ECS task definitions' `DATABASE_URL` Secrets Manager value to point at the restored cluster's writer endpoint.
5. Force a new ECS deployment on each service.
6. Validate via the smoke checklist in §"Post-restore validation".
7. Once validated, delete the old (compromised) cluster.

## Restore procedure (S3 objects)

For accidental deletion of a specific document: use bucket versioning to `aws s3api list-object-versions` and restore the prior version via `aws s3api copy-object`.

## Post-restore validation

- `/health/ready` returns 200 on all services.
- `pnpm db:migrate` (against the restored DB) is a no-op (all migrations already applied).
- A test user can log in, create a plan, and trigger one HITL approval.
- The latest 100 events in `core.events` are present and have plausible `occurred_at`.

## Quarterly restore test

Schedule a calendar reminder: every 90 days, run the restore procedure against a non-prod environment. Spin up a temp cluster from the latest snapshot, point a disposable ECS service at it, run `scripts/dr-validate.sh` (to be written — currently a follow-up; the calendar reminder still applies), and tear it down. Record the wallclock time; if RTO drifts above 1h, raise a follow-up.

## Backup retention policy

- Aurora PITR: 35 days.
- Snapshot retention beyond PITR: manual monthly snapshots, retained 12 months.
- S3 noncurrent versions: 90 days, then expired.

## Out of scope

- Multi-region failover (single-region deployment is the current target; cross-region is a future program).
- Off-cloud restore (use case is in-cloud disasters, not full AWS outage).
