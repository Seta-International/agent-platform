/**
 * The Graph `/users/delta` `$select` field set (design §5, §7.1), plus `manager` — already
 * unwrapped from the `manager@delta` navigation array by the delta walker — and delta's
 * `@removed` marker. Graph omits fields rather than nulling them, so everything but `id` is
 * optional/nullable.
 */
export interface GraphDirectoryUser {
  id: string;
  displayName?: string | null;
  // givenName/surname/assignedLicenses back the resource-mailbox exclusion in `filter.ts`; Graph
  // omits assignedLicenses rather than sending [] when a user holds none.
  givenName?: string | null;
  surname?: string | null;
  assignedLicenses?: Array<{ skuId?: string | null }> | null;
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

/**
 * The photo pipeline's resolved outcome, as handed to `mapGraphUser` (FUT-842). The orchestrator
 * (Task 13, not yet written) turns `DirectoryGraph.photo()`'s `fetched` case into `stored` once
 * the bytes are uploaded via `putObject` and a key exists; `unchanged`/`none` pass straight
 * through from `photo()`. See `graph.ts`'s `PhotoFetchResult` doc comment for why `unchanged` and
 * `none` must never collapse into the same value.
 */
export type PhotoOutcome =
  | { kind: 'unchanged' }
  | { kind: 'none' }
  | { kind: 'stored'; key: string; etag: string | null };

export interface MapGraphUserExtras {
  /** `null` = mailboxSettings was unavailable for this user (see `MailboxSettings` doc). */
  mailbox: MailboxSettings | null;
  /**
   * CONTRACT binding on the caller (Task 13, the orchestrator, not yet written):
   * `photo_storage_key` is an *asserted* field in `directory-diff.ts` — any `null` `mapGraphUser`
   * produces here ERASES the person's stored photo. `result` is `DirectoryGraph.photo()`'s
   * resolved outcome (as turned into `stored` by the caller once uploaded, see `PhotoOutcome`).
   * `currentKey` is the person's `photo_storage_key` AS IT STANDS TODAY — the caller reads it
   * from `m365_person_links` / the person row BEFORE calling this function. `mapGraphUser` maps:
   *   - `unchanged` -> `currentKey`, passed straight through — NEVER `null`. Mapping `unchanged`
   *     to `null` would erase every unchanged photo in the company on the very next sync, which
   *     is strictly worse than the bug this contract fixes.
   *   - `none`      -> `null` (the photo was genuinely removed from Entra — erase it).
   *   - `stored`    -> the new key.
   */
  photo: { result: PhotoOutcome; currentKey: string | null };
}
