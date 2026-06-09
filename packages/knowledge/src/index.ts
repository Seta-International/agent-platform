export {
  assertChatAttachmentReadable,
  ChatAttachmentError,
  type DeleteChatAttachmentInput,
  deleteChatAttachment,
  listPendingThreadAttachments,
  markAttachmentsConsumed,
  markAttachmentsFailed,
  markChatAttachmentUploaded,
  type PendingThreadAttachment,
  type RequestChatAttachmentUploadDeps,
  type RequestChatAttachmentUploadInput,
  type RequestChatAttachmentUploadResult,
  requestChatAttachmentUpload,
  threadPendingBytes,
} from './backend/domain/chat-attachment.ts';
export {
  type DeleteKnowledgeFileDeps,
  type DeleteKnowledgeFileInput,
  deleteKnowledgeFile,
  type PurgeKnowledgeFileDeps,
  purgeKnowledgeFile,
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
  type EmbedKnowledgeChunksDeps,
  type EmbedKnowledgeChunksPayload,
  embedKnowledgeChunks,
} from './backend/embeddings/embed-knowledge-chunks.ts';
export {
  ensureKnowledgeVectorIndex,
  getKnowledgeVectorStore,
  KNOWLEDGE_VECTOR_DIMENSION,
  KNOWLEDGE_VECTOR_INDEX,
  KNOWLEDGE_VECTOR_NAMESPACE,
  type KnowledgeChunkVectorMetadata,
  knowledgeVectorId,
  resetKnowledgeVectorStore,
} from './backend/embeddings/vector-store.ts';
export { KnowledgeError, requirePermission as requireKnowledgePermission } from './backend/rbac.ts';
export {
  type ConsumedAttachment,
  ContextOverflowError,
  consumeThreadAttachmentsAsText,
} from './backend/retrieval/consume-thread-attachments.ts';
export {
  type KnowledgeHit,
  type SearchTenantKnowledgeDeps,
  type SearchTenantKnowledgeInput,
  searchTenantKnowledge,
} from './backend/retrieval/search-tenant-knowledge.ts';
export {
  KNOWLEDGE_DOCUMENT_SCAN_COMPLETED,
  KNOWLEDGE_DOCUMENT_SCAN_COMPLETED_VERSION,
  KNOWLEDGE_FILE_FAILED,
  KNOWLEDGE_FILE_FAILED_VERSION,
  KNOWLEDGE_FILE_PROCESSED,
  KNOWLEDGE_FILE_PROCESSED_VERSION,
  type KnowledgeDocumentScanCompletedPayload,
  type KnowledgeFileFailedPayload,
  type KnowledgeFileProcessedPayload,
} from './events.ts';
export {
  KNOWLEDGE_PERMISSIONS,
  KNOWLEDGE_ROLE_PERMISSIONS,
  KNOWLEDGE_ROLE_SLUGS,
  type KnowledgePermission,
  type KnowledgeRoleSlug,
} from './rbac.ts';
export { registerKnowledgeContributions } from './register.ts';
