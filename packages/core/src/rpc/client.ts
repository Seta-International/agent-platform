import { randomUUID } from 'node:crypto';
import type { ModuleKey } from '@seta/shared-types';
import type { RpcMethodDef, RpcMethodMap } from './define.ts';
import { RpcInvalidArgument } from './errors.ts';
import { rbacCheck } from './rbac.ts';
import type { RuntimeRegistry } from './registry.ts';
import { callRemote } from './transport.ts';

type InputOf<D> = D extends RpcMethodDef<infer I, unknown> ? I : never;
type OutputOf<D> = D extends RpcMethodDef<unknown, infer O> ? O : never;

export type ModuleClient<M extends RpcMethodMap> = {
  [K in keyof M]: (input: InputOf<M[K]>) => Promise<OutputOf<M[K]>>;
};

export function createModuleClient<M extends RpcMethodMap>(
  reg: RuntimeRegistry,
  module: ModuleKey,
  methods: M,
): ModuleClient<M> {
  const route = reg.requireRoute(module);
  const out = {} as ModuleClient<M>;
  for (const methodName of Object.keys(methods) as Array<keyof M & string>) {
    const def = methods[methodName] as RpcMethodDef<unknown, unknown>;

    if (route.kind === 'local') {
      out[methodName] = (async (input: unknown) => {
        const parsed = def.input.safeParse(input);
        if (!parsed.success) {
          throw new RpcInvalidArgument(
            module,
            methodName,
            parsed.error.issues.map((i) => ({
              path: i.path.map((p) => (typeof p === 'symbol' ? p.toString() : p)),
              message: i.message,
            })),
          );
        }
        const actor = reg.getCurrentActor();
        if (!actor) {
          throw new Error(
            `createModuleClient: no current actor for ${module}.${methodName} (set via request middleware)`,
          );
        }
        rbacCheck(actor, def.permission, module, methodName);
        return def.handler(parsed.data, { actor });
      }) as ModuleClient<M>[keyof M & string];
    } else {
      const baseUrl = route.baseUrl;
      out[methodName] = (async (input: unknown) => {
        const actor = reg.getCurrentActor();
        if (!actor) {
          throw new Error(`createModuleClient: no current actor for ${module}.${methodName}`);
        }
        return callRemote({
          module,
          method: methodName,
          baseUrl,
          authHeader: reg.getAuthHeader(),
          input,
          actor,
          idempotencyKey: def.mutates ? randomUUID() : undefined,
          fetch: reg.getFetch(),
        });
      }) as ModuleClient<M>[keyof M & string];
    }
  }
  return out;
}
