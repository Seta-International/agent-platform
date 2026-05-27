import { describe, expect, it } from 'vitest';
import { AGENT_PERMISSIONS } from '../../src/rbac.ts';

describe('AGENT_PERMISSIONS', () => {
  it('contains chat + thread + workflow self-read permissions', () => {
    expect(AGENT_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'agent.chat.use',
        'agent.thread.read.self',
        'agent.thread.write.self',
        'agent.workflow.run.read.self',
      ]),
    );
  });

  it('contains the four new workflow run + approval permissions', () => {
    expect(AGENT_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'agent.workflow.run.read.tenant',
        'agent.workflow.run.read.instance',
        'agent.workflow.run.execute.self',
        'agent.workflow.approve',
      ]),
    );
  });
});
