import { RequestContext } from '@mastra/core/request-context';
import type { SpecializedAgentRunCtx } from '@seta/agent-sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  loadUserContextSection,
  makeUpdateWorkingMemoryTool,
} from '../../../src/backend/orchestration/working-memory.tools.ts';

// defineAgentTool's wrapper (timeout/breaker) reads ctx.requestContext for the
// per-tenant breaker key — give tool.execute a real RequestContext, same as
// skill-matcher.tools.test.ts.
function toolCtx() {
  const rc = new RequestContext();
  rc.set('tenant_id', 't1');
  rc.set('actor', { type: 'user', user_id: 'u1' });
  return { requestContext: rc } as never;
}

function ctxWith(memoryOverrides: Record<string, unknown> = {}): {
  ctx: SpecializedAgentRunCtx;
  memory: {
    getSystemMessage: ReturnType<typeof vi.fn>;
    updateWorkingMemory: ReturnType<typeof vi.fn>;
  };
  memoryConfig: Record<string, unknown>;
} {
  const memory = {
    getSystemMessage: vi.fn(async () => 'WM-SECTION'),
    updateWorkingMemory: vi.fn(async () => {}),
    ...memoryOverrides,
  };
  const memoryConfig = { lastMessages: false };
  const ctx: SpecializedAgentRunCtx = {
    tenantId: 't1',
    actorUserId: 'u1',
    threadId: 'conv-1',
    userMemory: { memory: memory as never, memoryConfig: memoryConfig as never },
  };
  return { ctx, memory, memoryConfig };
}

describe('loadUserContextSection', () => {
  it('renders the working-memory system message for (thread, user resource)', async () => {
    const { ctx, memory, memoryConfig } = ctxWith();
    await expect(loadUserContextSection(ctx)).resolves.toBe('WM-SECTION');
    expect(memory.getSystemMessage).toHaveBeenCalledWith({
      threadId: 'conv-1',
      resourceId: 'u1',
      memoryConfig,
    });
  });

  it('returns null without a userMemory handle', async () => {
    await expect(
      loadUserContextSection({ tenantId: 't1', actorUserId: 'u1', threadId: 'conv-1' }),
    ).resolves.toBeNull();
  });

  it('returns null without a threadId (first turn)', async () => {
    const { ctx } = ctxWith();
    await expect(loadUserContextSection({ ...ctx, threadId: undefined })).resolves.toBeNull();
  });

  it('returns null when getSystemMessage throws (best-effort)', async () => {
    const { ctx } = ctxWith({
      getSystemMessage: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    await expect(loadUserContextSection(ctx)).resolves.toBeNull();
  });
});

describe('makeUpdateWorkingMemoryTool', () => {
  it('returns null without a handle or threadId', () => {
    expect(makeUpdateWorkingMemoryTool({ tenantId: 't1', actorUserId: 'u1' })).toBeNull();
    const { ctx } = ctxWith();
    expect(makeUpdateWorkingMemoryTool({ ...ctx, threadId: undefined })).toBeNull();
  });

  it('writes a valid userContext payload to resource-scoped working memory', async () => {
    const { ctx, memory, memoryConfig } = ctxWith();
    const tool = makeUpdateWorkingMemoryTool(ctx)!;
    const payload = JSON.stringify({ userContext: { timezone: 'Asia/Ho_Chi_Minh' } });
    const out = (await tool.execute!({ memory: payload } as never, toolCtx())) as {
      success: boolean;
    };
    expect(out.success).toBe(true);
    expect(memory.updateWorkingMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'conv-1',
        resourceId: 'u1',
        memoryConfig,
        workingMemory: expect.stringContaining('Asia/Ho_Chi_Minh'),
      }),
    );
  });

  it('rejects an entity-zone write without touching memory (guard)', async () => {
    const { ctx, memory } = ctxWith();
    const tool = makeUpdateWorkingMemoryTool(ctx)!;
    const out = (await tool.execute!(
      { memory: JSON.stringify({ entities: { recentTasks: [] } }) } as never,
      toolCtx(),
    )) as { success: boolean; reason?: string };
    expect(out.success).toBe(true); // guard answers no-op success
    expect(out.reason).toMatch(/server-owned/i);
    expect(memory.updateWorkingMemory).not.toHaveBeenCalled();
  });

  it('rejects non-JSON payloads with a schema reason', async () => {
    const { ctx, memory } = ctxWith();
    const tool = makeUpdateWorkingMemoryTool(ctx)!;
    const out = (await tool.execute!({ memory: 'not-json' } as never, toolCtx())) as {
      success: boolean;
      reason?: string;
    };
    expect(out.success).toBe(false);
    expect(out.reason).toMatch(/JSON object/i);
    expect(memory.updateWorkingMemory).not.toHaveBeenCalled();
  });
});
