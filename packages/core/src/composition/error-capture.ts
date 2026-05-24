import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { Hono } from 'hono';

export function captureException(err: unknown): void {
  const span = trace.getActiveSpan();
  if (!span) return;
  if (err instanceof Error) {
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
  }
}

/**
 * Registers a Hono `onError` that records the exception against the active
 * OTEL span and otherwise mirrors Hono's default error response. HTTPException
 * subclasses keep their pre-built response.
 */
export function registerErrorCapture(app: Hono): void {
  app.onError((err, _c) => {
    captureException(err);
    const httpExc = err as Error & { getResponse?: () => Response };
    if (typeof httpExc.getResponse === 'function') return httpExc.getResponse();
    return new Response('Internal Server Error', { status: 500 });
  });
}
