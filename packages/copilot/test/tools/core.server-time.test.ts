import { describe, expect, it } from 'vitest';
import { serverTimeTool } from '../../src/backend/tools/core.server-time.ts';

describe('core.serverTime tool', () => {
  it('returns an ISO timestamp', async () => {
    const out = (await serverTimeTool.execute({ user_id: 'u1', type: 'user' }, {})) as {
      iso: string;
    };
    expect(out.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('has requiredPermission copilot.chat.use', () => {
    expect(serverTimeTool.requiredPermission).toBe('copilot.chat.use');
  });
});
