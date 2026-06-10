import { type Statement, toManifest } from '@seta/shared-rbac';

export const knowledgeStatement = {
  'knowledge.file': ['read', 'write', 'delete'],
  'knowledge.search': ['read'],
  'knowledge.chat_attachment': ['write'],
} as const satisfies Statement;

const roleStatements = {
  'knowledge.member': {
    'knowledge.file': ['read', 'write', 'delete'],
    'knowledge.search': ['read'],
  },
  'knowledge.viewer': { 'knowledge.file': ['read'], 'knowledge.search': ['read'] },
} as const satisfies Record<string, Statement>;

export const knowledgeRbac = toManifest('knowledge', knowledgeStatement, roleStatements, {
  'knowledge.member': 'Read, write, and delete knowledge files',
  'knowledge.viewer': 'Read knowledge files',
});

export type KnowledgePermission = (typeof knowledgeRbac.permissions)[number]['key'];

export const KNOWLEDGE_PERMISSIONS = knowledgeRbac.permissions.map((p) => p.key);
