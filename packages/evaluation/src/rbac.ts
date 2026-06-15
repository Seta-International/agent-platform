import { type Statement, toManifest } from '@seta/shared-rbac';

export const evaluationStatement = {
  'evaluation.dataset': ['read', 'write'],
  'evaluation.run': ['read', 'write'],
} as const satisfies Statement;

const roleStatements = {
  'evaluation.admin': {
    'evaluation.dataset': ['read', 'write'],
    'evaluation.run': ['read', 'write'],
  },
  'evaluation.viewer': {
    'evaluation.dataset': ['read'],
    'evaluation.run': ['read'],
  },
} as const satisfies Record<string, Statement>;

export const evaluationRbac = toManifest('evaluation', evaluationStatement, roleStatements, {
  'evaluation.admin': 'Create and run evaluations, manage datasets',
  'evaluation.viewer': 'Read evaluation datasets and runs',
});

export type EvaluationPermission = (typeof evaluationRbac.permissions)[number]['key'];

export const EVALUATION_PERMISSIONS = evaluationRbac.permissions.map((p) => p.key);
