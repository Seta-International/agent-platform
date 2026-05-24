import { AsyncLocalStorage } from 'node:async_hooks';
import { trace } from '@opentelemetry/api';
import type { MiddlewareHandler } from 'hono';
import { ulid } from 'ulid';

export type RequestIdStore = { requestId: string };
export const requestIdStorage = new AsyncLocalStorage<RequestIdStore>();

export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const inbound = c.req.header('x-request-id');
  const requestId = inbound && inbound.length > 0 && inbound.length <= 128 ? inbound : ulid();

  c.header('x-request-id', requestId);
  trace.getActiveSpan()?.setAttribute('http.request_id', requestId);

  await requestIdStorage.run({ requestId }, () => next());
};
