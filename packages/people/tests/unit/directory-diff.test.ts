import { describe, expect, it } from 'vitest';
import type {
  DirectoryPerson,
  EmploymentPeriodState,
  PersonState,
} from '../../src/backend/domain/directory-diff.ts';
import {
  normalizeDate,
  normalizeEmail,
  normalizeTime,
  planDirectoryUpdate,
  planIsEmpty,
} from '../../src/backend/domain/directory-diff.ts';

function incoming(overrides: Partial<DirectoryPerson> = {}): DirectoryPerson {
  return {
    entra_oid: 'oid',
    work_email: 'a@x.vn',
    full_name: 'Ada',
    employee_no: null,
    personal_email: null,
    phone: null,
    hire_date: null,
    leave_date: null,
    job_title: null,
    employment_type: null,
    account_enabled: true,
    org_unit_id: null,
    photo_storage_key: null,
    timezone: null,
    work_start: null,
    work_end: null,
    ooo_until: null,
    auto_replies_enabled: null,
    ...overrides,
  };
}

function current(overrides: Partial<PersonState> = {}): PersonState {
  return {
    full_name: 'Ada',
    work_email: 'a@x.vn',
    employee_no: null,
    personal_email: null,
    phone: null,
    org_unit_id: null,
    photo_storage_key: null,
    original_hire_date: null,
    availability_status: 'available',
    ooo_until: null,
    timezone: 'UTC',
    work_start: null,
    work_end: null,
    ...overrides,
  };
}

const noPeriod: EmploymentPeriodState | null = null;

describe('normalizers', () => {
  it('lowercases and trims emails', () => {
    expect(normalizeEmail('  A@X.VN ')).toBe('a@x.vn');
  });

  it('pads HH:MM to a Postgres time and passes HH:MM:SS through', () => {
    expect(normalizeTime('08:30')).toBe('08:30:00');
    expect(normalizeTime('08:30:00')).toBe('08:30:00');
    expect(normalizeTime('')).toBeNull();
    expect(normalizeTime(null)).toBeNull();
  });

  it('truncates an ISO timestamp to a date', () => {
    expect(normalizeDate('2026-08-15T09:00:00.000Z')).toBe('2026-08-15');
    expect(normalizeDate(null)).toBeNull();
  });
});

describe('planDirectoryUpdate', () => {
  it('is empty when nothing changed — this is what makes a replay a no-op', () => {
    expect(planIsEmpty(planDirectoryUpdate(incoming(), current(), noPeriod))).toBe(true);
  });

  it('asserts M365-owned fields, including erasing with null', () => {
    const plan = planDirectoryUpdate(
      incoming({ full_name: 'Ada L', employee_no: null }),
      current({ full_name: 'Ada', employee_no: 'E-1' }),
      noPeriod,
    );
    expect(plan.person.full_name).toBe('Ada L');
    // employee_no is asserted, so Entra dropping it erases ours.
    expect(plan.person).toHaveProperty('employee_no', null);
  });

  it('never erases an asserted-when-present field that Entra simply omits', () => {
    const plan = planDirectoryUpdate(
      incoming({ phone: null, org_unit_id: null }),
      current({ phone: '123', org_unit_id: 'ou-1' }),
      noPeriod,
    );
    expect(plan.person).not.toHaveProperty('phone');
    expect(plan.person).not.toHaveProperty('org_unit_id');
  });

  // FUT-842: photo_storage_key moved from "asserted when present" to "asserted" — see the
  // policy comment above planDirectoryUpdate. graph.ts's photo() can no longer collapse "no
  // photo" and "unchanged" into the same `null`, so a `null` reaching here is unambiguous: the
  // caller (mapGraphUser, see its MapGraphUserExtras.photo doc comment in @seta/integrations)
  // resolved Graph's outcome BEFORE calling this function and is asserting a real erase.
  describe('photo_storage_key is asserted, not asserted-when-present', () => {
    it(
      'an unchanged photo (incoming carries the SAME key the caller read back) is not rewritten — ' +
        'the anti-regression case for a company-wide wipe: this must fail if a caller ever maps ' +
        'an unchanged photo to `null` instead of passing the current key through',
      () => {
        const plan = planDirectoryUpdate(
          incoming({ photo_storage_key: 'photos/oid-1.jpg' }),
          current({ photo_storage_key: 'photos/oid-1.jpg' }),
          noPeriod,
        );
        expect(plan.person).not.toHaveProperty('photo_storage_key');
      },
    );

    it('a genuinely deleted Entra photo (incoming null) erases the stored key', () => {
      const plan = planDirectoryUpdate(
        incoming({ photo_storage_key: null }),
        current({ photo_storage_key: 'photos/oid-1.jpg' }),
        noPeriod,
      );
      expect(plan.person).toHaveProperty('photo_storage_key', null);
    });

    it('a new photo key overwrites the previously stored one', () => {
      const plan = planDirectoryUpdate(
        incoming({ photo_storage_key: 'photos/oid-2.jpg' }),
        current({ photo_storage_key: 'photos/oid-1.jpg' }),
        noPeriod,
      );
      expect(plan.person.photo_storage_key).toBe('photos/oid-2.jpg');
    });
  });

  it('sets ooo and the ooo_until instant when auto replies are on', () => {
    const plan = planDirectoryUpdate(
      incoming({ auto_replies_enabled: true, ooo_until: '2026-08-15T09:00:00.000Z' }),
      current({ availability_status: 'available' }),
      noPeriod,
    );
    expect(plan.person.availability_status).toBe('ooo');
    expect(plan.person.ooo_until).toEqual(new Date('2026-08-15T09:00:00.000Z'));
  });

  it('clears ooo back to available when auto replies go off', () => {
    const plan = planDirectoryUpdate(
      incoming({ auto_replies_enabled: false }),
      current({ availability_status: 'ooo', ooo_until: new Date('2026-08-01T00:00:00Z') }),
      noPeriod,
    );
    expect(plan.person.availability_status).toBe('available');
    expect(plan.person.ooo_until).toBeNull();
  });

  it('leaves a manually set busy alone — it has no Graph equivalent', () => {
    const plan = planDirectoryUpdate(
      incoming({ auto_replies_enabled: false }),
      current({ availability_status: 'busy' }),
      noPeriod,
    );
    expect(plan.person).not.toHaveProperty('availability_status');
  });

  it('writes nothing mailbox-sourced when mailboxSettings was unavailable', () => {
    const plan = planDirectoryUpdate(
      incoming({ auto_replies_enabled: null, timezone: null, work_start: null, work_end: null }),
      current({ timezone: 'Asia/Ho_Chi_Minh', work_start: '09:00:00', work_end: '18:00:00' }),
      noPeriod,
    );
    expect(plan.person).not.toHaveProperty('timezone');
    expect(plan.person).not.toHaveProperty('work_start');
    expect(plan.person).not.toHaveProperty('work_end');
    expect(plan.person).not.toHaveProperty('availability_status');
  });

  it('diffs the open employment period and only closes it one-way', () => {
    const period: EmploymentPeriodState = {
      job_title: 'Dev',
      employment_type: 'full_time',
      start_date: '2020-01-01',
    };
    const changed = planDirectoryUpdate(
      incoming({ job_title: 'Senior Dev', leave_date: '2026-09-30T00:00:00Z' }),
      current(),
      period,
    );
    expect(changed.period.job_title).toBe('Senior Dev');
    expect(changed.period.end_date).toBe('2026-09-30');

    // A leave date that disappears from Entra must not reopen employment.
    const reopened = planDirectoryUpdate(incoming({ job_title: 'Dev' }), current(), period);
    expect(reopened.period).not.toHaveProperty('end_date');
  });
});
