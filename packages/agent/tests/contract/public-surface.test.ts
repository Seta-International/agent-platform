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
  'registerAgentContributions',
  // model resolver — exported for the composition root to inject models into
  // orchestrator adapters (orchestrator modules may not import the engine).
  'resolveModel',
  'ModelNotFoundError',
]);

const EXPECTED_EXPORT_SUBPATHS = new Set<string>([
  '.',
  './events',
  './rbac',
  './register',
  './testing',
]);

const FORBIDDEN_VALUES = [
  'buildMastra',
  'getMastra',
  'registerAgent',
  'registerWorkflowInputSchema',
  'resumeRetry',
  'sweepWorkflowApprovals',
  'bindOtel',
  'otel',
  'listModels',
  'AGENT_PERMISSIONS',
];

describe('@seta/agent public surface', () => {
  it('package.json exports declares exactly the canonical subpaths', () => {
    const declared = new Set(Object.keys(pkg.exports as Record<string, unknown>));
    expect(declared).toEqual(EXPECTED_EXPORT_SUBPATHS);
  });

  it('main entry exports only the workflow-run domain surface', async () => {
    const mod = await import('@seta/agent');
    const actual = new Set(Object.keys(mod));
    expect(actual).toEqual(EXPECTED_NAMED_EXPORTS);
  });

  it('main entry does not re-export engine internals', async () => {
    const mod = (await import('@seta/agent')) as Record<string, unknown>;
    for (const name of FORBIDDEN_VALUES) {
      expect(mod[name], `'${name}' must not be on the main entry`).toBeUndefined();
    }
  });
});
