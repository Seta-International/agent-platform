import {
  callRemote,
  createModuleClient,
  createRegistry,
  defineModuleRpc,
  ModuleUnavailable,
  mountModuleRpc,
  peerAuth,
  RpcActorSchema,
  RpcForbidden,
  RpcInvalidArgument,
  type RpcMethodMap,
  rbacCheck,
  W3C_TRACEPARENT,
} from '@seta/core/rpc';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const SECRET = '0123456789abcdef0123456789abcdef-pad-to-32+';

const adminActor = {
  user_id: 'u1',
  tenant_id: 't1',
  email: 'u1@example.com',
  display_name: 'U',
  role_summary: { roles: ['tenant.admin'], cross_tenant_read: false },
  cross_tenant_read: false,
};

const memberActor = {
  user_id: 'u2',
  tenant_id: 't1',
  email: 'u2@example.com',
  display_name: 'M',
  role_summary: { roles: ['member'], cross_tenant_read: false },
  cross_tenant_read: false,
};

const identityMethods = {
  getUserProfile: {
    permission: 'identity.user.read.any',
    input: z.object({ userId: z.string().min(1) }),
    handler: async (input: unknown) => {
      const { userId } = input as { userId: string };
      return { user_id: userId, display_name: 'Mock' };
    },
  },
  createUser: {
    permission: 'identity.user.write.any',
    mutates: true,
    input: z.object({ email: z.string() }),
    handler: async (input: unknown) => {
      const { email } = input as { email: string };
      return { user_id: 'new', email };
    },
  },
} satisfies RpcMethodMap;

describe('rpc shim — public surface', () => {
  it('W3C_TRACEPARENT constant is the canonical header name', () => {
    expect(W3C_TRACEPARENT).toBe('traceparent');
  });

  it('RpcActorSchema accepts the canonical actor shape', () => {
    expect(() => RpcActorSchema.parse(adminActor)).not.toThrow();
  });

  it('rbacCheck passes for admin, throws RpcForbidden for member', () => {
    expect(() =>
      rbacCheck(adminActor, 'identity.user.read.any', 'identity', 'getUserProfile'),
    ).not.toThrow();
    expect(() =>
      rbacCheck(memberActor, 'identity.user.read.any', 'identity', 'getUserProfile'),
    ).toThrow(RpcForbidden);
  });

  it('peerAuth(bearer) rejects construction with a short secret', () => {
    expect(() => peerAuth({ kind: 'bearer', secret: 'short' })).toThrow(/at least 32/);
  });

  it('mountModuleRpc accepts wellformed bearer + actor, rejects no-auth (401)', async () => {
    const parent = new Hono();
    mountModuleRpc(parent, {
      module: 'identity',
      auth: { kind: 'bearer', secret: SECRET },
      methods: identityMethods,
    });
    const noAuth = await parent.request('/_rpc/identity/getUserProfile', {
      method: 'POST',
      body: JSON.stringify({ userId: 'u1' }),
    });
    expect(noAuth.status).toBe(401);

    const ok = await parent.request('/_rpc/identity/getUserProfile', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SECRET}`,
        'X-Rpc-Actor': JSON.stringify(adminActor),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: 'u1' }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ user_id: 'u1', display_name: 'Mock' });
  });

  it('defineModuleRpc 403s when actor lacks permission', async () => {
    const app = defineModuleRpc({ module: 'identity', methods: identityMethods });
    const res = await app.request('/_rpc/identity/getUserProfile', {
      method: 'POST',
      headers: {
        'X-Rpc-Actor': JSON.stringify(memberActor),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: 'u1' }),
    });
    expect(res.status).toBe(403);
  });

  it('defineModuleRpc 400s when input fails zod parse', async () => {
    const app = defineModuleRpc({ module: 'identity', methods: identityMethods });
    const res = await app.request('/_rpc/identity/getUserProfile', {
      method: 'POST',
      headers: {
        'X-Rpc-Actor': JSON.stringify(adminActor),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('createRegistry routes loaded module locally and unknown remote', () => {
    const reg = createRegistry({
      loaded: { identity: identityMethods },
      peerUrls: { planner: 'http://planner:4001' },
      authHeader: `Bearer ${SECRET}`,
      currentActor: () => adminActor,
    });
    expect(reg.isLocal('identity')).toBe(true);
    expect(reg.isLocal('planner')).toBe(false);
    expect(reg.getPeerUrl('planner')).toBe('http://planner:4001');
    expect(() => reg.requireRoute('copilot')).toThrow(/copilot/);
  });

  it('createModuleClient — in-proc path runs handler', async () => {
    const reg = createRegistry({
      loaded: { identity: identityMethods },
      peerUrls: {},
      authHeader: `Bearer ${SECRET}`,
      currentActor: () => adminActor,
    });
    const identity = createModuleClient(reg, 'identity', identityMethods);
    const result = await identity.getUserProfile({ userId: 'u1' });
    expect(result).toEqual({ user_id: 'u1', display_name: 'Mock' });
  });

  it('createModuleClient — HTTP path dispatches via fetch', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ user_id: 'u1', display_name: 'A' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const reg = createRegistry({
      loaded: {},
      peerUrls: { identity: 'http://identity:4001' },
      authHeader: `Bearer ${SECRET}`,
      currentActor: () => adminActor,
      fetch: fetchFn,
    });
    const identity = createModuleClient(reg, 'identity', identityMethods);
    const result = await identity.getUserProfile({ userId: 'u1' });
    expect(result).toEqual({ user_id: 'u1', display_name: 'A' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchFn.mock.calls as unknown as Array<[string, RequestInit]>)[0]!;
    expect(url).toBe('http://identity:4001/_rpc/identity/getUserProfile');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SECRET}`);
  });

  it('callRemote — auto Idempotency-Key omitted for non-mutating methods', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await callRemote({
      module: 'identity',
      method: 'getUserProfile',
      baseUrl: 'http://peer:4001',
      authHeader: `Bearer ${SECRET}`,
      input: { userId: 'u1' },
      actor: adminActor,
      fetch: fetchFn,
    });
    const init = (fetchFn.mock.calls as unknown as Array<[string, RequestInit]>)[0]![1];
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBeUndefined();
  });

  it('callRemote — maps 403 to RpcForbidden', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'forbidden', permission: 'identity.user.read.any' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
    );
    await expect(
      callRemote({
        module: 'identity',
        method: 'getUserProfile',
        baseUrl: 'http://peer:4001',
        authHeader: `Bearer ${SECRET}`,
        input: { userId: 'u1' },
        actor: adminActor,
        fetch: fetchFn,
      }),
    ).rejects.toBeInstanceOf(RpcForbidden);
  });

  it('callRemote — retries 503 once then throws ModuleUnavailable', async () => {
    const fetchFn = vi.fn(async () => new Response('upstream down', { status: 503 }));
    await expect(
      callRemote({
        module: 'identity',
        method: 'getUserProfile',
        baseUrl: 'http://peer:4001',
        authHeader: `Bearer ${SECRET}`,
        input: { userId: 'u1' },
        actor: adminActor,
        fetch: fetchFn,
        backoff: { baseMs: 1, jitterMs: 0 },
      }),
    ).rejects.toBeInstanceOf(ModuleUnavailable);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('callRemote — does NOT retry on 400 (RpcInvalidArgument)', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'invalid_argument', issues: [] }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    );
    await expect(
      callRemote({
        module: 'identity',
        method: 'getUserProfile',
        baseUrl: 'http://peer:4001',
        authHeader: `Bearer ${SECRET}`,
        input: {},
        actor: adminActor,
        fetch: fetchFn,
      }),
    ).rejects.toBeInstanceOf(RpcInvalidArgument);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
