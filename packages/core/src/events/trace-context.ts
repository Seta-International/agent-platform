import { type Context, context, propagation } from '@opentelemetry/api';

export type CapturedTraceContext = {
  traceParent: string | null;
  traceState: string | null;
};

export function captureActiveTraceContext(): CapturedTraceContext {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return {
    traceParent: carrier.traceparent ?? null,
    traceState: carrier.tracestate ?? null,
  };
}

export function restoreTraceContext(row: {
  traceParent: string | null;
  traceState: string | null;
}): Context {
  const carrier: Record<string, string> = {};
  if (row.traceParent) carrier.traceparent = row.traceParent;
  if (row.traceState) carrier.tracestate = row.traceState;
  return propagation.extract(context.active(), carrier);
}
