import { check } from 'k6';
import { get } from '../lib/api.ts';

const T = { journey: 'health' };

// Unauthenticated infra/proxy-latency canary. Only /health/live is asserted:
// /health/ready is a composite worker-backlog/liveness signal that returns 503
// under load for reasons unrelated to HTTP-serving latency, so probing it here
// would pollute the global http_req_failed / checks gate. Readiness/backlog is
// watched on the app-health dashboard + PRG-3 alerts instead.
export function healthCanary(): void {
  check(get('/health/live', T), { 'live ok': (r) => r.status === 200 });
}
