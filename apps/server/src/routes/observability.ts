import { metrics } from '@opentelemetry/api';
import type { SessionEnv } from '@seta/core';
import type { Hono } from 'hono';
import { z } from 'zod';

const VitalName = z.enum(['LCP', 'FID', 'CLS', 'INP', 'TTFB', 'FCP']);

const Payload = z.object({
  name: VitalName,
  value: z.number().finite(),
  id: z.string().max(128),
  delta: z.number().finite().optional(),
  navigationType: z.string().max(32).optional(),
});

const meter = metrics.getMeter('@seta/server/web-vitals');
const histogram = meter.createHistogram('web_vitals', {
  description: 'Core Web Vitals reported by the browser',
});

export function registerObservabilityRoutes(app: Hono<SessionEnv>): void {
  app.post('/api/observability/v1/web-vitals', async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = Payload.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'invalid_payload', issues: parsed.error.issues }, 400);
    }
    histogram.record(parsed.data.value, {
      'web_vital.name': parsed.data.name,
      'web_vital.navigation_type': parsed.data.navigationType ?? 'unknown',
    });
    return c.body(null, 204);
  });
}
