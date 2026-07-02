import { describe, expect, it } from 'vitest';
import { AGENT_PERMISSIONS } from '../../src/rbac.ts';

describe('AGENT_PERMISSIONS', () => {
  it('contains chat + thread + workflow run permissions', () => {
    expect(AGENT_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'agent.chat.use',
        'agent.thread.read',
        'agent.thread.write',
        'agent.workflow.run.read',
      ]),
    );
  });

  it('contains the workflow run execute/cancel + approval permissions', () => {
    expect(AGENT_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'agent.workflow.run.execute',
        'agent.workflow.run.cancel',
        'agent.workflow.approve',
      ]),
    );
  });
});
