import { check } from 'k6';
import { get } from '../lib/api.ts';

const T = { journey: 'health' };

// Unauthenticated canary: isolates infra/proxy latency from app-session latency.
export function healthCanary(): void {
  check(get('/health/live', T), { 'live ok': (r) => r.status === 200 });
  check(get('/health/ready', T), { 'ready ok': (r) => r.status === 200 });
}
