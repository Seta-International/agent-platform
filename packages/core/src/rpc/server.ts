import type { Hono } from 'hono';
import { type PeerAuthOpts, peerAuth } from './auth.ts';
import { type DefineModuleRpcOpts, defineModuleRpc, type RpcMethodMap } from './define.ts';

export interface MountModuleRpcOpts<M extends RpcMethodMap> extends DefineModuleRpcOpts<M> {
  auth: PeerAuthOpts;
}

export function mountModuleRpc<M extends RpcMethodMap>(
  parent: Hono,
  opts: MountModuleRpcOpts<M>,
): void {
  const inner = defineModuleRpc({ module: opts.module, methods: opts.methods });
  parent.use(`/_rpc/${opts.module}/*`, peerAuth(opts.auth));
  parent.route('/', inner);
}
