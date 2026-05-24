export const KNOWLEDGE_PERMISSIONS = [
  'knowledge.file.read',
  'knowledge.file.write',
  'knowledge.file.delete',
  'knowledge.search.read',
] as const;
export type KnowledgePermission = (typeof KNOWLEDGE_PERMISSIONS)[number];

export const KNOWLEDGE_ROLE_SLUGS = ['knowledge.member', 'knowledge.viewer'] as const;
export type KnowledgeRoleSlug = (typeof KNOWLEDGE_ROLE_SLUGS)[number];

export const KNOWLEDGE_ROLE_PERMISSIONS: Record<KnowledgeRoleSlug, KnowledgePermission[]> = {
  'knowledge.member': [
    'knowledge.file.read',
    'knowledge.file.write',
    'knowledge.file.delete',
    'knowledge.search.read',
  ],
  'knowledge.viewer': ['knowledge.file.read', 'knowledge.search.read'],
};
