import { context, propagation, SpanKind, trace } from '@opentelemetry/api';

export const W3C_TRACEPARENT = 'traceparent';

export function injectTraceparent(headers: Record<string, string>): void {
  const before = headers[W3C_TRACEPARENT];
  propagation.inject(context.active(), headers, {
    set: (carrier, key, value) => {
      carrier[key] = String(value);
    },
  });
  if (headers[W3C_TRACEPARENT] !== before) return;
  const span = trace.getActiveSpan();
  if (!span) return;
  const sc = span.spanContext();
  headers[W3C_TRACEPARENT] = `00-${sc.traceId}-${sc.spanId}-0${sc.traceFlags.toString(16)}`;
}

export async function withRemoteSpan<T>(
  name: string,
  headers: Record<string, string | string[] | undefined>,
  body: () => Promise<T>,
): Promise<T> {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v === 'string') flat[k.toLowerCase()] = v;
    else if (Array.isArray(v) && typeof v[0] === 'string') flat[k.toLowerCase()] = v[0];
  }
  const parentCtx = propagation.extract(context.active(), flat, {
    get: (c, k) => c[k.toLowerCase()],
    keys: (c) => Object.keys(c),
  });
  const tracer = trace.getTracer('@seta/core/rpc');
  const span = tracer.startSpan(name, { kind: SpanKind.SERVER }, parentCtx);
  const childCtx = trace.setSpan(parentCtx, span);
  try {
    return await context.with(childCtx, body);
  } catch (err) {
    span.recordException(err as Error);
    throw err;
  } finally {
    span.end();
  }
}
