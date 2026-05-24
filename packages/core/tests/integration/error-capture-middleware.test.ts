import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerErrorCapture, requestIdMiddleware } from '../../src/index.ts';

const exporter = new InMemorySpanExporter();
let providerReady = false;

function ensureTracerProvider(): void {
  if (providerReady) return;
  const contextManager = new AsyncHooksContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  providerReady = true;
}

describe('error-capture (Hono onError)', () => {
  beforeAll(() => {
    ensureTracerProvider();
  });

  it('records the thrown error as a span exception event and returns 500', async () => {
    exporter.reset();
    const tracer = trace.getTracer('test');
    const app = new Hono();
    app.use('*', requestIdMiddleware);
    registerErrorCapture(app);
    app.get('/boom', () => {
      throw new Error('boom-from-route');
    });

    let status: number | undefined;
    await tracer.startActiveSpan('http-request', async (span) => {
      const res = await app.request('/boom');
      status = res.status;
      span.end();
    });

    expect(status).toBe(500);

    const httpSpan = exporter.getFinishedSpans().find((s) => s.name === 'http-request');
    expect(httpSpan).toBeDefined();
    const exceptionEvent = httpSpan?.events.find((e) => e.name === 'exception');
    expect(exceptionEvent).toBeDefined();
    expect(exceptionEvent?.attributes?.['exception.message']).toBe('boom-from-route');
  });
});
