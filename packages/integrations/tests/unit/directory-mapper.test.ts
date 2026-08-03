import { describe, expect, it } from 'vitest';
import { mapGraphUser } from '../../src/backend/m365/directory/mapper.ts';
import type {
  GraphDirectoryUser,
  MailboxSettings,
} from '../../src/backend/m365/directory/types.ts';

const baseUser: GraphDirectoryUser = {
  id: 'oid-1',
  displayName: 'Jane Doe',
  mail: 'jane.doe@seta-international.vn',
};

const noMailbox = { mailbox: null, photoKey: null };

// One assertion per row of design §5.1 ("Fills an existing column").
describe('mapGraphUser — §5.1 fills an existing column', () => {
  it('displayName -> full_name', () => {
    const result = mapGraphUser({ ...baseUser, displayName: 'Jane Doe' }, noMailbox);
    expect(result.full_name).toBe('Jane Doe');
  });

  it('employeeId -> employee_no', () => {
    const result = mapGraphUser({ ...baseUser, employeeId: 'EMP-42' }, noMailbox);
    expect(result.employee_no).toBe('EMP-42');
  });

  it('mail -> work_email', () => {
    const result = mapGraphUser({ ...baseUser, mail: 'jane@seta-international.vn' }, noMailbox);
    expect(result.work_email).toBe('jane@seta-international.vn');
  });

  it('otherMails[0] -> personal_email', () => {
    const result = mapGraphUser(
      { ...baseUser, otherMails: ['jane.personal@gmail.com', 'other@gmail.com'] },
      noMailbox,
    );
    expect(result.personal_email).toBe('jane.personal@gmail.com');
  });

  it('mobilePhone -> phone', () => {
    const result = mapGraphUser({ ...baseUser, mobilePhone: '+84-901-000-000' }, noMailbox);
    expect(result.phone).toBe('+84-901-000-000');
  });

  it('employeeHireDate -> hire_date (feeds both original_hire_date and employment_period.start_date downstream)', () => {
    const result = mapGraphUser(
      { ...baseUser, employeeHireDate: '2024-01-15T00:00:00Z' },
      noMailbox,
    );
    expect(result.hire_date).toBe('2024-01-15');
  });

  it('employeeLeaveDateTime -> leave_date', () => {
    const result = mapGraphUser(
      { ...baseUser, employeeLeaveDateTime: '2026-03-01T00:00:00Z' },
      noMailbox,
    );
    expect(result.leave_date).toBe('2026-03-01');
  });

  it('jobTitle -> job_title', () => {
    const result = mapGraphUser({ ...baseUser, jobTitle: 'Engineer' }, noMailbox);
    expect(result.job_title).toBe('Engineer');
  });

  it('employeeType -> employment_type', () => {
    const result = mapGraphUser({ ...baseUser, employeeType: 'Employee' }, noMailbox);
    expect(result.employment_type).toBe('Employee');
  });

  it("accountEnabled -> account_enabled (the lifecycle_stage derivation half of this row has no DirectoryPerson field and is out of the mapper's scope)", () => {
    const enabled = mapGraphUser({ ...baseUser, accountEnabled: true }, noMailbox);
    expect(enabled.account_enabled).toBe(true);
    const disabled = mapGraphUser({ ...baseUser, accountEnabled: false }, noMailbox);
    expect(disabled.account_enabled).toBe(false);
  });

  it('department / employeeOrgData.division do NOT resolve org_unit_id here — the mapper always emits null; §3.2 resolution is DB-backed and happens in the caller', () => {
    const result = mapGraphUser(
      { ...baseUser, department: 'Engineering', employeeOrgData: { division: 'Delivery' } },
      noMailbox,
    );
    expect(result.org_unit_id).toBeNull();
  });

  it('mailboxSettings.timeZone -> timezone', () => {
    const mailbox: MailboxSettings = {
      timeZone: 'SE Asia Standard Time',
      workingHours: null,
      automaticRepliesSetting: null,
    };
    const result = mapGraphUser(baseUser, { mailbox, photoKey: null });
    expect(result.timezone).toBe('SE Asia Standard Time');
  });

  it('mailboxSettings.workingHours.startTime -> work_start', () => {
    const mailbox: MailboxSettings = {
      timeZone: null,
      workingHours: { startTime: '09:00:00', endTime: '18:00:00' },
      automaticRepliesSetting: null,
    };
    const result = mapGraphUser(baseUser, { mailbox, photoKey: null });
    expect(result.work_start).toBe('09:00:00');
  });

  it('mailboxSettings.workingHours.endTime -> work_end', () => {
    const mailbox: MailboxSettings = {
      timeZone: null,
      workingHours: { startTime: '09:00:00', endTime: '18:00:00' },
      automaticRepliesSetting: null,
    };
    const result = mapGraphUser(baseUser, { mailbox, photoKey: null });
    expect(result.work_end).toBe('18:00:00');
  });

  it('mailboxSettings.automaticRepliesSetting.scheduledEndDateTime -> ooo_until', () => {
    const mailbox: MailboxSettings = {
      timeZone: null,
      workingHours: null,
      automaticRepliesSetting: {
        status: 'scheduled',
        scheduledEndDateTime: { dateTime: '2026-08-10T00:00:00Z' },
      },
    };
    const result = mapGraphUser(baseUser, { mailbox, photoKey: null });
    expect(result.ooo_until).toBe('2026-08-10T00:00:00Z');
  });

  it('mailboxSettings.automaticRepliesSetting.status -> auto_replies_enabled (availability_status itself is derived downstream, in @seta/people)', () => {
    const mailbox: MailboxSettings = {
      timeZone: null,
      workingHours: null,
      automaticRepliesSetting: { status: 'alwaysEnabled', scheduledEndDateTime: null },
    };
    const result = mapGraphUser(baseUser, { mailbox, photoKey: null });
    expect(result.auto_replies_enabled).toBe(true);
  });
});

describe('mapGraphUser — §5.2 fills a new column', () => {
  it('extras.photoKey -> photo_storage_key', () => {
    const result = mapGraphUser(baseUser, { mailbox: null, photoKey: 'photos/oid-1.jpg' });
    expect(result.photo_storage_key).toBe('photos/oid-1.jpg');
  });

  it('extras.photoKey null -> photo_storage_key null', () => {
    const result = mapGraphUser(baseUser, { mailbox: null, photoKey: null });
    expect(result.photo_storage_key).toBeNull();
  });
});

describe('mapGraphUser — required cases beyond §5.1', () => {
  it('mail absent falls back to userPrincipalName', () => {
    const result = mapGraphUser(
      { id: 'oid-2', userPrincipalName: 'x@seta-international.vn' },
      noMailbox,
    );
    expect(result.work_email).toBe('x@seta-international.vn');
  });

  it('mobilePhone absent falls back to businessPhones[0]', () => {
    const result = mapGraphUser(
      { ...baseUser, mobilePhone: undefined, businessPhones: ['+84-111-000', '+84-222-000'] },
      noMailbox,
    );
    expect(result.phone).toBe('+84-111-000');
  });

  it('mobilePhone and businessPhones both absent -> phone null', () => {
    const result = mapGraphUser({ ...baseUser }, noMailbox);
    expect(result.phone).toBeNull();
  });

  it('otherMails empty -> personal_email null', () => {
    const result = mapGraphUser({ ...baseUser, otherMails: [] }, noMailbox);
    expect(result.personal_email).toBeNull();
  });

  it('otherMails absent -> personal_email null', () => {
    const result = mapGraphUser({ ...baseUser }, noMailbox);
    expect(result.personal_email).toBeNull();
  });

  it('employeeHireDate as a full ISO timestamp comes out as a plain YYYY-MM-DD date', () => {
    const result = mapGraphUser(
      { ...baseUser, employeeHireDate: '2023-06-05T09:30:00.0000000Z' },
      noMailbox,
    );
    expect(result.hire_date).toBe('2023-06-05');
  });

  it('extras.mailbox null -> auto_replies_enabled null AND the four mailbox-sourced fields null', () => {
    const result = mapGraphUser(baseUser, { mailbox: null, photoKey: null });
    expect(result.auto_replies_enabled).toBeNull();
    expect(result.timezone).toBeNull();
    expect(result.work_start).toBeNull();
    expect(result.work_end).toBeNull();
    expect(result.ooo_until).toBeNull();
  });

  it('automaticRepliesSetting.status "scheduled" counts as enabled, exactly like "alwaysEnabled"', () => {
    const mailbox: MailboxSettings = {
      timeZone: null,
      workingHours: null,
      automaticRepliesSetting: {
        status: 'scheduled',
        scheduledEndDateTime: { dateTime: '2026-09-01T00:00:00Z' },
      },
    };
    const result = mapGraphUser(baseUser, { mailbox, photoKey: null });
    expect(result.auto_replies_enabled).toBe(true);
  });

  it('automaticRepliesSetting.status "disabled" -> auto_replies_enabled false (known, not unknown)', () => {
    const mailbox: MailboxSettings = {
      timeZone: null,
      workingHours: null,
      automaticRepliesSetting: { status: 'disabled', scheduledEndDateTime: null },
    };
    const result = mapGraphUser(baseUser, { mailbox, photoKey: null });
    expect(result.auto_replies_enabled).toBe(false);
  });

  it('never throws on a fully bare Graph user — Graph omits fields rather than nulling them', () => {
    expect(() => mapGraphUser({ id: 'bare-oid' }, { mailbox: null, photoKey: null })).not.toThrow();
  });
});
