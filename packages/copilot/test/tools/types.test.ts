import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';
import {
  actorFromContext,
  type CopilotRequestContext,
  RequestContextSchema,
  requiredPermissionFor,
} from '../../src/backend/tools/_types.ts';
import { STATIC_SELF_TOOLS } from '../../src/backend/tools/self-tools.ts';

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

describe('STATIC_SELF_TOOLS', () => {
  it('contains the four static self tools, each with a registered required permission', () => {
    const ids = STATIC_SELF_TOOLS.map((t) => t.id).sort();
    expect(ids).toEqual([
      'core_serverTime',
      'identity_listMyRoles',
      'identity_updateMyDisplayName',
      'identity_whoAmI',
    ]);
    for (const t of STATIC_SELF_TOOLS) {
      expect(requiredPermissionFor(t)).toBeDefined();
    }
  });
});
