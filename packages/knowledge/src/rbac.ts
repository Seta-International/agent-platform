export const KNOWLEDGE_PERMISSIONS = {
  'knowledge.read': 'Read tenant knowledge files',
  'knowledge.upload': 'Upload knowledge files',
  'knowledge.delete': 'Delete knowledge files',
} as const;

export type KnowledgePermission = keyof typeof KNOWLEDGE_PERMISSIONS;
