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
});
