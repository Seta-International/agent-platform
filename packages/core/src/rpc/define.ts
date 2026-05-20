import type { ModuleKey } from '@seta/shared-types';
import { Hono } from 'hono';
import type { z } from 'zod';
import { RpcForbidden } from './errors.ts';
import { withIdempotency } from './idempotency.ts';
import { RpcActorSchema, rbacCheck } from './rbac.ts';
import { withRemoteSpan } from './tracing.ts';

export interface RpcMethodDef<I, O> {
  permission: string;
  input: z.ZodType<I>;
  mutates?: boolean;
  handler: (input: I, ctx: { actor: z.infer<typeof RpcActorSchema> }) => Promise<O>;
}

export type RpcMethodMap = Record<string, RpcMethodDef<unknown, unknown>>;

export interface DefineModuleRpcOpts<M extends RpcMethodMap> {
  module: ModuleKey;
  methods: M;
}

export function defineModuleRpc<M extends RpcMethodMap>(opts: DefineModuleRpcOpts<M>): Hono {
  const app = new Hono();

  for (const [methodName, def] of Object.entries(opts.methods)) {
    app.post(`/_rpc/${opts.module}/${methodName}`, async (c) => {
      const actorHeader = c.req.header('X-Rpc-Actor');
      if (!actorHeader) {
        return c.json(
          { error: 'invalid_argument', issues: [{ path: ['X-Rpc-Actor'], message: 'Required' }] },
          400,
        );
      }
      let actorJson: unknown;
      try {
        actorJson = JSON.parse(actorHeader);
      } catch {
        return c.json(
          {
            error: 'invalid_argument',
            issues: [{ path: ['X-Rpc-Actor'], message: 'Malformed JSON' }],
          },
          400,
        );
      }
      const actorResult = RpcActorSchema.safeParse(actorJson);
      if (!actorResult.success) {
        return c.json(
          {
            error: 'invalid_argument',
            issues: actorResult.error.issues.map((i) => ({
              path: i.path.map((p) => (typeof p === 'symbol' ? p.toString() : p)),
              message: i.message,
            })),
          },
          400,
        );
      }
      const actor = actorResult.data;

      let bodyJson: unknown;
      try {
        bodyJson = await c.req.json();
      } catch {
        return c.json(
          { error: 'invalid_argument', issues: [{ path: ['body'], message: 'Malformed JSON' }] },
          400,
        );
      }
      const inputResult = def.input.safeParse(bodyJson);
      if (!inputResult.success) {
        return c.json(
          {
            error: 'invalid_argument',
            issues: inputResult.error.issues.map((i) => ({
              path: i.path.map((p) => (typeof p === 'symbol' ? p.toString() : p)),
              message: i.message,
            })),
          },
          400,
        );
      }

      try {
        return await withRemoteSpan(
          `${opts.module}.${methodName}`,
          Object.fromEntries(c.req.raw.headers),
          async () => {
            try {
              rbacCheck(actor, def.permission, opts.module, methodName);
            } catch (e) {
              if (e instanceof RpcForbidden) {
                return c.json({ error: 'forbidden', permission: e.permission }, 403);
              }
              throw e;
            }

            const idemKey = c.req.header('Idempotency-Key');
            const runHandler = () => def.handler(inputResult.data, { actor });
            const result =
              def.mutates && idemKey
                ? await withIdempotency(idemKey, opts.module, methodName, runHandler)
                : await runHandler();
            return c.json(result as Record<string, unknown>);
          },
        );
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'unknown';
        return c.json({ error: 'internal', detail }, 500);
      }
    });
  }

  return app;
}
