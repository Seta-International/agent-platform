export { peopleDb } from './backend/db/client.ts';
export { employmentPeriod } from './backend/db/schema.ts';
export {
  type AllocationBucket,
  type AllocationFacets,
  type AllocationGrid,
  type AllocationGridKpis,
  type AllocationGridQuery,
  type AllocationGridRow,
  type AllocationStatus,
  type EffortByAccount,
  getAllocationGrid,
  type WorkerMonthTotal,
} from './backend/domain/allocation-grid.ts';
export { createOrgUnit } from './backend/domain/create-org-unit.ts';
export { createWorker } from './backend/domain/create-worker.ts';
export {
  readCycleUnlockPanel,
  relockCycle,
  resolveOverrideActive,
  unlockCycle,
} from './backend/domain/cycle-unlock.ts';
export { type DeleteOrgUnitInput, deleteOrgUnit } from './backend/domain/delete-org-unit.ts';
export { editWorker } from './backend/domain/edit-worker.ts';
export {
  readEvaluation,
  saveEvaluationDraft,
  submitEvaluation,
} from './backend/domain/evaluation.ts';
export type { DirectoryRow } from './backend/domain/list-directory.ts';
export { listDirectory } from './backend/domain/list-directory.ts';
export {
  listMoraleInbox,
  NO_PROJECT_FILTER,
  NO_PROJECT_LABEL,
} from './backend/domain/list-morale-inbox.ts';
export { listMoraleNotes } from './backend/domain/list-morale-notes.ts';
export {
  type MatchUsersToTopicDeps,
  type MatchUsersToTopicInput,
  matchUsersToTopic,
  type UserMatch,
} from './backend/domain/match-users-to-topic.ts';
export {
  classifyCycleStatus,
  latestClosedCycleMonth,
  monthClockNow,
  setMonthClock,
  vnYearMonth,
} from './backend/domain/month-clock.ts';
export { listMoraleInboxFilters } from './backend/domain/morale-inbox-filters.ts';
export { resolveSenderProjectContext } from './backend/domain/morale-project-context.ts';
export {
  type MoraleReviewerScope,
  type MoraleTrendScope,
  resolveMoraleReviewerScope,
} from './backend/domain/morale-reviewer-scope.ts';
export { getMoraleTrend, MIN_TREND_RESPONSES } from './backend/domain/morale-trend.ts';
export type {
  CompanyNode,
  CompanyNodeKind,
  DeliveryAccount,
  OrgPersonRef,
  OrgUnitNode,
} from './backend/domain/org-structure.ts';
export { getOrgCompany, getOrgDelivery, getOrgStructure } from './backend/domain/org-structure.ts';
export {
  addPersonSkill,
  getPersonSkills,
  type PersonSkill,
  removePersonSkill,
  setMySkillLevel,
  setMySkills,
  setPersonSkillLevel,
} from './backend/domain/person-skills.ts';
export {
  PHOTO_REDIRECT_CACHE_SECONDS,
  PHOTO_URL_TTL_SECONDS,
  type PhotoPresignDeps,
  personPhotoUrl,
  workerPhotoDownloadUrl,
} from './backend/domain/photo.ts';
export { provisionAccount } from './backend/domain/provision-account.ts';
export { provisionWorker } from './backend/domain/provision-worker.ts';
export { readCycleStatus } from './backend/domain/read-cycle-status.ts';
export { readMonthTasks } from './backend/domain/read-month-tasks.ts';
export { getMoraleNote, markMoraleNoteRead } from './backend/domain/read-morale-note.ts';
export { type MyProfile, readMyProfile } from './backend/domain/read-my-profile.ts';
export { readPerformanceConfig } from './backend/domain/read-performance-config.ts';
export { readPerformanceContext } from './backend/domain/read-performance-context.ts';
export { readPerformanceRollup } from './backend/domain/read-performance-rollup.ts';
export { type PresenceResult, readPresence } from './backend/domain/read-presence.ts';
export { getWorker, getWorkerHistory, listWorkers } from './backend/domain/read-workers.ts';
export { resolveMoraleRecipients } from './backend/domain/resolve-morale-recipients.ts';
export { savePerformanceConfig } from './backend/domain/save-performance-config.ts';
export { seedDemoEvaluations } from './backend/domain/seed-demo-evaluations.ts';
export { setBio } from './backend/domain/set-bio.ts';
export { reinstateWorker, terminateWorker } from './backend/domain/set-employment-status.ts';
export { type SetPresenceInput, setPresence } from './backend/domain/set-presence.ts';
export { submitMoraleNote } from './backend/domain/submit-morale-note.ts';
export {
  type DirectoryPerson,
  type DirectorySyncOutcome,
  syncDirectoryPeople,
} from './backend/domain/sync-directory-people.ts';
export { type UpdateOrgUnitInput, updateOrgUnit } from './backend/domain/update-org-unit.ts';
export {
  getUtilizationByPerson,
  type UtilizationByPerson,
  type UtilizationQuery,
  type UtilizationRow,
  type UtilizationSegment,
} from './backend/domain/utilization.ts';
export { getWorkerIdForUser } from './backend/domain/worker-identity.ts';
export {
  type BackfillPersonProfilesOptions,
  backfillPersonProfiles,
} from './backend/embeddings/backfill/backfill-profiles.ts';
export { peopleEmbeddingJobs } from './backend/embeddings/register-jobs.ts';
export type { PersonProfileSourceInput } from './backend/embeddings/source.ts';
export { buildPersonProfileSource } from './backend/embeddings/source.ts';
export {
  ensurePeopleVectorIndex,
  getPeopleVectorStore,
  PEOPLE_VECTOR_DIMENSION,
  PEOPLE_VECTOR_INDEX,
  PEOPLE_VECTOR_NAMESPACE,
  type PersonProfileVectorMetadata,
  personProfileVectorId,
  resetPeopleVectorStore,
} from './backend/embeddings/vector-store.ts';
export type {
  CreateWorkerInput,
  CycleRelockInput,
  CycleStatus,
  CycleStatusQuery,
  CycleStatusResponse,
  CycleUnlockAccountState,
  CycleUnlockEntry,
  CycleUnlockInput,
  CycleUnlockPanel,
  EditWorkerInput,
  MonthTaskCard,
  MonthTaskGroup,
  MonthTasksQuery,
  MonthTasksResponse,
  MoraleHistoryQuery,
  MoraleHistoryResponse,
  MoraleInboxFiltersResponse,
  MoraleInboxNote,
  MoraleInboxProjectGroup,
  MoraleInboxProjectOption,
  MoraleInboxQuery,
  MoraleInboxResponse,
  MoraleInboxSenderOption,
  MoraleNoteView,
  MoraleProjectOption,
  MoraleRecipientCandidate,
  MoraleRecipientGroup,
  MoraleRecipientsForm,
  MoraleRecipientsQuery,
  MoraleRecipientsResponse,
  MoraleRecipientTag,
  MoraleRecipientView,
  MoraleSelectableTag,
  MoraleSenderCapacity,
  MoraleTrendPoint,
  MoraleTrendQuery,
  MoraleTrendResponse,
  PerformanceCapacity,
  PerformanceConfigCriterionView,
  PerformanceConfigGroupView,
  PerformanceConfigResponse,
  PerformanceContext,
  PerformanceContextInput,
  ProvisionWorkerInput,
  SavePerformanceConfigInput,
  SavePerformanceConfigResponse,
  SubmitMoraleInput,
} from './contracts.ts';
export {
  cycleRelockInput,
  cycleStatusEnum,
  cycleStatusQuery,
  cycleStatusResponse,
  cycleUnlockEntry,
  cycleUnlockInput,
  cycleUnlockPanel,
  GENDER_VALUES,
  type GenderValue,
  genderValue,
  monthTaskCard,
  monthTasksQuery,
  monthTasksResponse,
  moraleHistoryQuery,
  moraleHistoryResponse,
  moraleInboxFiltersResponse,
  moraleInboxNote,
  moraleInboxProjectGroup,
  moraleInboxQuery,
  moraleInboxResponse,
  moraleNoteView,
  moraleProjectOption,
  moraleRecipientCandidate,
  moraleRecipientGroup,
  moraleRecipientsForm,
  moraleRecipientsQuery,
  moraleRecipientsResponse,
  moraleRecipientTag,
  moraleSelectableTag,
  moraleSenderCapacity,
  moraleTrendPoint,
  moraleTrendQuery,
  moraleTrendResponse,
  performanceConfigResponse,
  savePerformanceConfigInput,
  savePerformanceConfigResponse,
  submitMoraleInput,
} from './contracts.ts';
