export {
  type DeleteKnowledgeFileDeps,
  type DeleteKnowledgeFileInput,
  deleteKnowledgeFile,
} from './backend/domain/delete-file.ts';
export {
  type KnowledgeFileSummary,
  type ListKnowledgeFilesInput,
  listKnowledgeFiles,
} from './backend/domain/list-files.ts';
export {
  type MarkProcessedDeps,
  type MarkProcessedInput,
  markKnowledgeFileProcessed,
} from './backend/domain/mark-processed.ts';
export {
  type RequestKnowledgeUploadDeps,
  type RequestKnowledgeUploadInput,
  type RequestKnowledgeUploadResult,
  requestKnowledgeUpload,
} from './backend/domain/upload-url.ts';
export {
  type KnowledgeHit,
  type SearchTenantKnowledgeDeps,
  type SearchTenantKnowledgeInput,
  searchTenantKnowledge,
} from './backend/retrieval/search-tenant-knowledge.ts';
export {
  KNOWLEDGE_FILE_FAILED,
  KNOWLEDGE_FILE_FAILED_VERSION,
  KNOWLEDGE_FILE_PROCESSED,
  KNOWLEDGE_FILE_PROCESSED_VERSION,
  type KnowledgeFileFailedPayload,
  type KnowledgeFileProcessedPayload,
} from './events.ts';
export { KNOWLEDGE_PERMISSIONS, type KnowledgePermission } from './rbac.ts';
export { registerKnowledgeContributions } from './register.ts';
