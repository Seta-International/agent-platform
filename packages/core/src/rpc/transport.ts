import type { ModuleKey } from '@seta/shared-types';
import {
  ModuleUnavailable,
  RpcForbidden,
  RpcInternal,
  RpcInvalidArgument,
  type RpcIssue,
  RpcTimeout,
} from './errors.ts';
import type { RpcActor } from './rbac.ts';
import { injectTraceparent } from './tracing.ts';

export interface CallRemoteOpts<I = unknown> {
  module: ModuleKey;
  method: string;
  baseUrl: string;
  authHeader: string;
  input: I;
  actor: RpcActor;
  idempotencyKey?: string;
  timeoutMs?: number;
  backoff?: { baseMs?: number; jitterMs?: number };
  fetch?: typeof fetch;
}

interface ErrorBody {
  error?: string;
  permission?: string;
  issues?: ReadonlyArray<RpcIssue>;
  detail?: string;
}

const RETRYABLE_STATUSES = new Set([502, 503, 504]);

export async function callRemote<O = unknown>(opts: CallRemoteOpts): Promise<O> {
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const baseMs = opts.backoff?.baseMs ?? 100;
  const jitterMs = opts.backoff?.jitterMs ?? 50;
  const doFetch = opts.fetch ?? fetch;

  const attempt = async (): Promise<O> => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const headers: Record<string, string> = {
      Authorization: opts.authHeader,
      'Content-Type': 'application/json',
      'X-Rpc-Actor': JSON.stringify(opts.actor),
    };
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    injectTraceparent(headers);

    let res: Response;
    try {
      res = await doFetch(`${opts.baseUrl}/_rpc/${opts.module}/${opts.method}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(opts.input),
        signal: ac.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const e = err as Error;
      if (e.name === 'AbortError' || e.message === 'aborted') {
        throw new RpcTimeout(opts.module, opts.method, timeoutMs, err);
      }
      throw new ModuleUnavailable(opts.module, opts.method, err);
    }
    clearTimeout(timer);

    if (res.ok) {
      return (await res.json()) as O;
    }

    let body: ErrorBody = {};
    try {
      body = (await res.json()) as ErrorBody;
    } catch {
      // non-JSON error response
    }

    if (res.status === 401) {
      throw new ModuleUnavailable(opts.module, opts.method, new Error('peer returned 401'));
    }
    if (res.status === 403) {
      throw new RpcForbidden(opts.module, opts.method, body.permission ?? 'unknown');
    }
    if (res.status === 400) {
      throw new RpcInvalidArgument(opts.module, opts.method, body.issues ?? []);
    }
    if (RETRYABLE_STATUSES.has(res.status)) {
      throw new ModuleUnavailable(opts.module, opts.method, new Error(`HTTP ${res.status}`));
    }
    throw new RpcInternal(opts.module, opts.method, res.status, body.detail ?? 'no detail');
  };

  try {
    return await attempt();
  } catch (err) {
    const retryable = err instanceof ModuleUnavailable || err instanceof RpcTimeout;
    if (!retryable) throw err;
    await new Promise((r) => setTimeout(r, baseMs + Math.random() * jitterMs));
    try {
      return await attempt();
    } catch (err2) {
      if (err2 instanceof RpcTimeout) {
        throw new ModuleUnavailable(opts.module, opts.method, err2);
      }
      throw err2;
    }
  }
}
