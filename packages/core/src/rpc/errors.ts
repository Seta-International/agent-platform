import type { ModuleKey } from '@seta/shared-types';

abstract class RpcError extends Error {
  abstract readonly name: string;
  constructor(
    readonly module: ModuleKey,
    readonly method: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(`${module}.${method}: ${message}`);
  }
}

export class ModuleUnavailable extends RpcError {
  readonly name = 'ModuleUnavailable';
  constructor(module: ModuleKey, method: string, cause?: unknown) {
    super(module, method, 'peer unavailable after retry', cause);
  }
}

export class RpcTimeout extends RpcError {
  readonly name = 'RpcTimeout';
  constructor(
    module: ModuleKey,
    method: string,
    readonly timeoutMs: number,
    cause?: unknown,
  ) {
    super(module, method, `timed out after ${timeoutMs}ms`, cause);
  }
}

export class RpcForbidden extends RpcError {
  readonly name = 'RpcForbidden';
  constructor(
    module: ModuleKey,
    method: string,
    readonly permission: string,
  ) {
    super(module, method, `missing permission: ${permission}`);
  }
}

export interface RpcIssue {
  path: ReadonlyArray<string | number>;
  message: string;
}

export class RpcInvalidArgument extends RpcError {
  readonly name = 'RpcInvalidArgument';
  constructor(
    module: ModuleKey,
    method: string,
    readonly issues: ReadonlyArray<RpcIssue>,
  ) {
    super(module, method, `invalid argument: ${issues.map((i) => i.message).join('; ')}`);
  }
}

export class RpcInternal extends RpcError {
  readonly name = 'RpcInternal';
  constructor(
    module: ModuleKey,
    method: string,
    readonly status: number,
    detail: string,
    cause?: unknown,
  ) {
    super(module, method, `internal (HTTP ${status}): ${detail}`, cause);
  }
}

export type AnyRpcError =
  | ModuleUnavailable
  | RpcTimeout
  | RpcForbidden
  | RpcInvalidArgument
  | RpcInternal;
