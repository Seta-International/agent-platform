import type { DirectoryPerson } from '@seta/people';
import type { GraphDirectoryUser, MapGraphUserExtras } from './types.ts';

/** Graph hands back a full ISO timestamp; `DirectoryPerson` date fields want `YYYY-MM-DD`. */
function toDateOnly(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, 10);
}

/** `'scheduled'` behaves like `'alwaysEnabled'` — replies are on, just with a known end date. */
function repliesEnabled(status: string | null | undefined): boolean {
  return status === 'alwaysEnabled' || status === 'scheduled';
}

/**
 * Resolves `MapGraphUserExtras.photo` down to the `photo_storage_key` value — see that field's
 * doc comment in `types.ts` for the binding contract. `unchanged` MUST resolve to `currentKey`,
 * never `null` (FUT-842): `photo_storage_key` is asserted, so a `null` here erases.
 */
function resolvePhotoKey(photo: MapGraphUserExtras['photo']): string | null {
  switch (photo.result.kind) {
    case 'unchanged':
      return photo.currentKey;
    case 'none':
      return null;
    case 'stored':
      return photo.result.key;
  }
}

/**
 * Pure Graph → `DirectoryPerson` projection (design §5.1). No I/O — Graph omits fields rather
 * than nulling them, so this never throws on an absent field.
 *
 * Two §5.1 rows are deliberately NOT produced here:
 * - `department` / `employeeOrgData.division` → `person.org_unit_id` (§3.2) needs an
 *   `org_unit` lookup/create against Postgres; `org_unit_id` is always emitted `null` and
 *   resolved by the caller, per `DirectoryPerson`'s own doc comment.
 * - `manager` → `org_unit.head_worker_id` (§3.1) is a per-unit modal aggregate across many
 *   users, not a per-person field, and has no home on `DirectoryPerson` at all.
 *
 * A third row, `accountEnabled` + leave date → `employment_period.lifecycle_stage`, is derived
 * rather than mapped: this passes `account_enabled` straight through and `syncDirectoryPeople`
 * turns it into `lifecycle_stage = 'active'` on the create path only. Deliberately narrow —
 * §8.3 keeps offboarding a human decision, so a later `accountEnabled: false` never demotes.
 *
 * `photo_storage_key` (FUT-842): see `MapGraphUserExtras.photo`'s doc comment in `types.ts` for
 * the full contract — in short, `extras.photo.result.kind === 'unchanged'` resolves to
 * `extras.photo.currentKey`, NOT `null`, because `photo_storage_key` is an asserted field
 * downstream (`directory-diff.ts`) and an incoming `null` erases the stored photo. Task 13 (the
 * orchestrator) must supply the person's current key on every `unchanged` call.
 */
export function mapGraphUser(u: GraphDirectoryUser, extras: MapGraphUserExtras): DirectoryPerson {
  const mailbox = extras.mailbox;
  const autoRepliesEnabled = mailbox
    ? repliesEnabled(mailbox.automaticRepliesSetting?.status)
    : null;

  return {
    entra_oid: u.id,
    work_email: u.mail ?? u.userPrincipalName ?? '',
    full_name: u.displayName ?? '',
    employee_no: u.employeeId ?? null,
    personal_email: u.otherMails?.[0] ?? null,
    phone: u.mobilePhone ?? u.businessPhones?.[0] ?? null,
    hire_date: toDateOnly(u.employeeHireDate),
    leave_date: toDateOnly(u.employeeLeaveDateTime),
    job_title: u.jobTitle ?? null,
    employment_type: u.employeeType ?? null,
    account_enabled: u.accountEnabled ?? true,
    // Resolved by the caller — see the function doc comment above.
    org_unit_id: null,
    photo_storage_key: resolvePhotoKey(extras.photo),
    timezone: mailbox?.timeZone ?? null,
    work_start: mailbox?.workingHours?.startTime ?? null,
    work_end: mailbox?.workingHours?.endTime ?? null,
    ooo_until: mailbox?.automaticRepliesSetting?.scheduledEndDateTime?.dateTime ?? null,
    auto_replies_enabled: autoRepliesEnabled,
  };
}
