import { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  actorFromContext,
  type CopilotRequestContext,
  RequestContextSchema,
  registerToolPermission,
  requiredPermissionFor,
} from '../src/index.ts';

function ctxWith(entries: Record<string, unknown>) {
  const rc = new RequestContext<CopilotRequestContext>();
  for (const [k, v] of Object.entries(entries)) {
    rc.set(k as keyof CopilotRequestContext, v as never);
  }
  return { requestContext: rc };
}

describe('RequestContextSchema', () => {
  it('accepts a well-formed actor', () => {
    expect(() =>
      RequestContextSchema.parse({ actor: { type: 'user', user_id: 'u1' } }),
    ).not.toThrow();
  });

  it('rejects missing user_id', () => {
    expect(() => RequestContextSchema.parse({ actor: { type: 'user' } })).toThrow();
  });
});

describe('actorFromContext', () => {
  it('returns the actor when present and well-formed', () => {
    expect(actorFromContext(ctxWith({ actor: { type: 'user', user_id: 'u1' } }))).toEqual({
      type: 'user',
      user_id: 'u1',
    });
  });

  it('throws unauthenticated when actor is missing', () => {
    expect(() => actorFromContext(ctxWith({}))).toThrow('unauthenticated');
  });

  it('throws unauthenticated when actor.user_id is missing', () => {
    expect(() => actorFromContext(ctxWith({ actor: { type: 'user' } }))).toThrow('unauthenticated');
  });
});

describe('registerToolPermission', () => {
  it('attaches a permission discoverable via requiredPermissionFor', () => {
    const tool = registerToolPermission(
      createTool({
        id: 'test.echo',
        description: 'Echo back',
        inputSchema: z.object({ msg: z.string() }),
        outputSchema: z.object({ msg: z.string() }),
        execute: async () => ({ msg: 'ok' }),
      }),
      'test.echo.use',
    );
    expect(requiredPermissionFor(tool)).toBe('test.echo.use');
  });
});
