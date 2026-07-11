-- hand-written: bulk column copy across tables; Drizzle cannot express an UPDATE ... FROM.
UPDATE people.person p
SET employee_no          = w.employee_no,
    full_name            = w.full_name,
    work_email           = w.work_email,
    personal_email       = w.personal_email,
    dob                  = w.dob,
    gender               = w.gender,
    phone                = w.phone,
    emergency_contact    = w.emergency_contact,
    profile_completed_at = w.profile_completed_at,
    cv_storage_key       = w.cv_storage_key,
    org_unit_id          = w.org_unit_id,
    availability_status  = w.availability_status,
    ooo_until            = w.ooo_until,
    work_start           = w.work_start,
    work_end             = w.work_end,
    timezone             = w.timezone,
    deleted_at           = w.deleted_at,
    updated_at           = now()
FROM people.worker w
WHERE w.person_id = p.id AND w.tenant_id = p.tenant_id;

-- job_title lands on the OPEN employment period (end_date IS NULL); the one-open index guarantees ≤1.
UPDATE people.employment_period e
SET job_title = w.job_title, updated_at = now()
FROM people.worker w
WHERE w.person_id = e.person_id AND w.tenant_id = e.tenant_id AND e.end_date IS NULL;
