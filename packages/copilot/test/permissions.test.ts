import { describe, expect, it } from 'vitest';
import { COPILOT_PERMISSIONS } from '../src/permissions.ts';

describe('COPILOT_PERMISSIONS', () => {
  it('contains chat + thread + workflow self-read permissions', () => {
    expect(COPILOT_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'copilot.chat.use',
        'copilot.thread.read.self',
        'copilot.thread.write.self',
        'copilot.workflow.run.read.self',
      ]),
    );
  });

  it('contains the four new workflow run + approval permissions', () => {
    expect(COPILOT_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'copilot.workflow.run.read.tenant',
        'copilot.workflow.run.read.instance',
        'copilot.workflow.run.execute.self',
        'copilot.workflow.approve',
      ]),
    );
  });
});
