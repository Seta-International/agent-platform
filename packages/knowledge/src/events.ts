import { z } from 'zod';

export const KNOWLEDGE_FILE_PROCESSED = 'knowledge.file.processed' as const;
export const KNOWLEDGE_FILE_PROCESSED_VERSION = 1 as const;

export interface KnowledgeFileProcessedPayload {
  tenant_id: string;
  file_id: string;
}

export const KNOWLEDGE_FILE_PROCESSED_PAYLOAD = z.object({
  tenant_id: z.string(),
  file_id: z.string(),
});

export const KNOWLEDGE_FILE_FAILED = 'knowledge.file.failed' as const;
export const KNOWLEDGE_FILE_FAILED_VERSION = 1 as const;

export interface KnowledgeFileFailedPayload {
  tenant_id: string;
  file_id: string;
  error_reason: string;
}

export const KNOWLEDGE_FILE_FAILED_PAYLOAD = z.object({
  tenant_id: z.string(),
  file_id: z.string(),
  error_reason: z.string(),
});

export const KNOWLEDGE_EVENTS = {
  [KNOWLEDGE_FILE_PROCESSED]: KNOWLEDGE_FILE_PROCESSED_PAYLOAD,
  [KNOWLEDGE_FILE_FAILED]: KNOWLEDGE_FILE_FAILED_PAYLOAD,
} as const;
