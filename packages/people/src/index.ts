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
  listCycleUnlocks,
  relockCycle,
  resolveOverrideActive,
  unlockCycle,
} from './backend/domain/cycle-unlock.ts';
export { type DeleteOrgUnitInput, deleteOrgUnit } from './backend/domain/delete-org-unit.ts';
export { editWorker } from './backend/domain/edit-worker.ts';
export type { DirectoryRow } from './backend/domain/list-directory.ts';
export { listDirectory } from './backend/domain/list-directory.ts';
export {
  type MatchUsersToTopicDeps,
  type MatchUsersToTopicInput,
  matchUsersToTopic,
  type UserMatch,
} from './backend/domain/match-users-to-topic.ts';
export {
  classifyCycleStatus,
  monthClockNow,
  setMonthClock,
  vnYearMonth,
} from './backend/domain/month-clock.ts';
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
export { type MyProfile, readMyProfile } from './backend/domain/read-my-profile.ts';
export { readPerformanceConfig } from './backend/domain/read-performance-config.ts';
export { readPerformanceContext } from './backend/domain/read-performance-context.ts';
export { type PresenceResult, readPresence } from './backend/domain/read-presence.ts';
export { getWorker, getWorkerHistory, listWorkers } from './backend/domain/read-workers.ts';
export { savePerformanceConfig } from './backend/domain/save-performance-config.ts';
export { setBio } from './backend/domain/set-bio.ts';
export { reinstateWorker, terminateWorker } from './backend/domain/set-employment-status.ts';
export { type SetPresenceInput, setPresence } from './backend/domain/set-presence.ts';
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
  CycleStatus,
  CycleStatusQuery,
  CycleStatusResponse,
  CycleUnlockEntry,
  CycleUnlockInput,
  CycleUnlockLog,
  EditWorkerInput,
  MonthTaskCard,
  MonthTaskGroup,
  MonthTasksQuery,
  MonthTasksResponse,
  PerformanceCapacity,
  PerformanceConfigCriterionView,
  PerformanceConfigGroupView,
  PerformanceConfigResponse,
  PerformanceContext,
  PerformanceContextInput,
  ProvisionWorkerInput,
  SavePerformanceConfigInput,
  SavePerformanceConfigResponse,
} from './contracts.ts';
export {
  cycleStatusEnum,
  cycleStatusQuery,
  cycleStatusResponse,
  cycleUnlockEntry,
  cycleUnlockInput,
  cycleUnlockLog,
  GENDER_VALUES,
  type GenderValue,
  genderValue,
  monthTaskCard,
  monthTasksQuery,
  monthTasksResponse,
  performanceConfigResponse,
  savePerformanceConfigInput,
  savePerformanceConfigResponse,
} from './contracts.ts';
