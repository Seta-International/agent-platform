export const RPC_SUBPATH = '@seta/core/rpc';

export { type PeerAuthOpts, peerAuth } from './auth.ts';
export { createModuleClient, type ModuleClient } from './client.ts';
export {
  type DefineModuleRpcOpts,
  defineModuleRpc,
  type RpcMethodDef,
  type RpcMethodMap,
} from './define.ts';
export {
  type AnyRpcError,
  ModuleUnavailable,
  RpcForbidden,
  RpcInternal,
  RpcInvalidArgument,
  type RpcIssue,
  RpcTimeout,
} from './errors.ts';

export { withIdempotency } from './idempotency.ts';
export { type RpcActor, RpcActorSchema, rbacCheck } from './rbac.ts';
export {
  type CreateRegistryOpts,
  createRegistry,
  type ModuleRegistry,
  type RuntimeRegistry,
} from './registry.ts';

export { type MountModuleRpcOpts, mountModuleRpc } from './server.ts';
export { injectTraceparent, W3C_TRACEPARENT, withRemoteSpan } from './tracing.ts';
export { type CallRemoteOpts, callRemote } from './transport.ts';
