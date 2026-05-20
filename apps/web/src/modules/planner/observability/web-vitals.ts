import { type Metric, onCLS, onINP, onLCP } from 'web-vitals';

export function installWebVitals(send: (m: Metric) => void) {
  onCLS(send);
  onINP(send);
  onLCP(send);
}

export async function defaultSend(metric: Metric): Promise<void> {
  try {
    await fetch('/api/observability/v1/web-vitals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: metric.name,
        value: metric.value,
        id: metric.id,
        navigationType: metric.navigationType,
      }),
      keepalive: true,
    });
  } catch {
    // Vitals are best-effort — silently drop if ingest is unavailable.
  }
}
