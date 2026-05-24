import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };

const EXPECTED_NAMED_EXPORTS = new Set<string>([
  'cancelWorkflowRun',
  'decideApproval',
  'getWorkflowRun',
  'getWorkflowRunSnapshot',
  'listMyPendingApprovals',
  'listWorkflowRuns',
  'replayWorkflowFromStep',
  'rerunWorkflow',
  'registerCopilotContributions',
]);

const EXPECTED_EXPORT_SUBPATHS = new Set<string>([
  '.',
  './events',
  './rbac',
  './models',
  './register',
  './runtime',
  './workflows',
  './testing',
]);

const FORBIDDEN_VALUES = [
  'buildMastra',
  'getMastra',
  'registerCopilot',
  'registerWorkflowInputSchema',
  'resumeRetry',
  'sweepWorkflowApprovals',
  'bindOtel',
  'otel',
  'listModels',
  'resolveModel',
  'ModelNotFoundError',
  'COPILOT_PERMISSIONS',
];

describe('@seta/copilot public surface', () => {
  it('package.json exports declares exactly the canonical subpaths', () => {
    const declared = new Set(Object.keys(pkg.exports as Record<string, unknown>));
    expect(declared).toEqual(EXPECTED_EXPORT_SUBPATHS);
  });

  it('main entry exports only the workflow-run domain surface', async () => {
    const mod = await import('@seta/copilot');
    const actual = new Set(Object.keys(mod));
    expect(actual).toEqual(EXPECTED_NAMED_EXPORTS);
  });

  it('main entry does not re-export engine internals', async () => {
    const mod = (await import('@seta/copilot')) as Record<string, unknown>;
    for (const name of FORBIDDEN_VALUES) {
      expect(mod[name], `'${name}' must not be on the main entry`).toBeUndefined();
    }
  });
});
