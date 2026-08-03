/**
 * The Graph `/users/delta` `$select` field set (design §5, §7.1), plus `manager` — already
 * unwrapped from the `manager@delta` navigation array by the delta walker — and delta's
 * `@removed` marker. Graph omits fields rather than nulling them, so everything but `id` is
 * optional/nullable.
 */
export interface GraphDirectoryUser {
  id: string;
  displayName?: string | null;
  employeeId?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  otherMails?: string[] | null;
  mobilePhone?: string | null;
  businessPhones?: string[] | null;
  employeeHireDate?: string | null;
  employeeLeaveDateTime?: string | null;
  jobTitle?: string | null;
  employeeType?: string | null;
  accountEnabled?: boolean | null;
  userType?: string | null;
  department?: string | null;
  employeeOrgData?: { division?: string | null; costCenter?: string | null } | null;
  manager?: { id: string } | null;
  '@removed'?: { reason: string };
}

export interface MailboxWorkingHours {
  startTime: string | null;
  endTime: string | null;
}

export interface MailboxAutomaticRepliesSetting {
  status: 'disabled' | 'alwaysEnabled' | 'scheduled';
  scheduledEndDateTime: { dateTime: string | null } | null;
}

/**
 * `null` means Graph refused the `/users/{id}/mailboxSettings` call (403 — no `MailboxSettings.Read`
 * consent), not that the mailbox has no settings. `mapGraphUser` relies on this distinction.
 */
export interface MailboxSettings {
  timeZone: string | null;
  workingHours: MailboxWorkingHours | null;
  automaticRepliesSetting: MailboxAutomaticRepliesSetting | null;
}

export interface MapGraphUserExtras {
  /** `null` = mailboxSettings was unavailable for this user (see `MailboxSettings` doc). */
  mailbox: MailboxSettings | null;
  /** S3 key already uploaded by the caller, or `null` when no photo / unchanged (§5.2, §7.2). */
  photoKey: string | null;
}
