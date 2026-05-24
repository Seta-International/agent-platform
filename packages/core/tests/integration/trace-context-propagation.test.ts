import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { emit, withEmit } from '../../src/events/index.ts';
import { drainOne } from '../../src/runtime/dispatcher/drain.ts';
import { withCoreTestDb } from '../helpers.ts';

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

describe('trace context propagation across the event bus', () => {
  beforeAll(() => {
    ensureTracerProvider();
  });

  it('subscriber span shares the producer span trace id', async () => {
    await withCoreTestDb(async ({ pool, db }) => {
      resetCoreDb();
      exporter.reset();

      const tracer = trace.getTracer('test');
      const tenantId = crypto.randomUUID();
      const aggregateId = crypto.randomUUID();

      const producerSpan = tracer.startSpan('producer');
      const producerTraceId = producerSpan.spanContext().traceId;

      await context.with(trace.setSpan(context.active(), producerSpan), async () => {
        await withEmit(undefined, async () => {
          await emit({
            tenantId,
            aggregateType: 'test.thing',
            aggregateId,
            eventType: 'test.trace.propagation',
            eventVersion: 1,
            payload: { hello: 'trace' },
          });
        });
      });
      producerSpan.end();

      const sub = {
        subscription: 'test.trace-prop',
        event: 'test.trace.propagation',
        eventVersion: 1,
        handler: async () => {
          // no-op; span wiring is what we're asserting on
        },
      };
      // Seed the cursor row drainOne expects.
      await drainOne(
        db,
        sub,
        { baseMs: 10, maxMs: 100, maxAttempts: 3 },
        { error: () => {} },
        { incr: () => {} },
      );
      const drained = await drainOne(
        db,
        sub,
        { baseMs: 10, maxMs: 100, maxAttempts: 3 },
        { error: () => {} },
        { incr: () => {} },
      );
      expect(drained.processed).toBe(1);

      const subscriberSpan = exporter
        .getFinishedSpans()
        .find((s) => s.name.startsWith('subscriber.'));
      expect(subscriberSpan, 'expected a subscriber span').toBeDefined();
      expect(subscriberSpan?.spanContext().traceId).toBe(producerTraceId);

      void pool;
    });
  });
});
