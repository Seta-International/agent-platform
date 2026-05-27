import { requiredPermissionFor } from '@seta/agent-sdk';
import { makeToolContext } from '@seta/agent-sdk/testing';
import { serverTimeTool } from '@seta/core/agent-tools';
import { describe, expect, it } from 'vitest';

describe('core_serverTime tool', () => {
  it('returns an ISO timestamp', async () => {
    const out = await serverTimeTool.execute!({}, makeToolContext({ user_id: 'u1' }));
    expect((out as { iso: string }).iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('is registered with permission agent.chat.use', () => {
    expect(requiredPermissionFor(serverTimeTool)).toBe('agent.chat.use');
  });
});
