// Central load-test configuration: environment plumbing, scenarios, thresholds.
// SLO sources: docs/hosting/aws.md §11 (p95 < 250ms warm, 99.9% success) with a
// ~20% CI-variance buffer per the PRG-1 spec. Profile: 100 concurrent VUs total,
// weighted planner 50 / people 25 / pm 25 (spec §4).

export const BASE_URL = __ENV.BASE_URL ?? 'http://localhost:5173';
export const RUN_ID = __ENV.RUN_ID ?? `local-${Date.now()}`;
export const MEMBER_COUNT = Number(__ENV.MEMBER_COUNT ?? 100);
export const MEMBER_DOMAIN = __ENV.MEMBER_DOMAIN ?? 'loadtest.test';
export const MEMBER_PASSWORD = __ENV.LOADTEST_MEMBER_PASSWORD ?? 'ChangeMe@2026';
export const ADMIN_EMAIL = __ENV.LOADTEST_ADMIN_EMAIL ?? 'admin@loadtest.test';
export const ADMIN_PASSWORD = __ENV.LOADTEST_ADMIN_PASSWORD ?? 'ChangeMe@2026';

export const smokeMode = __ENV.LOAD_SMOKE === '1';

// Ramping-vus stages per journey. Peak sums to 100 across planner+people+pm.
// Smoke mode is the 2-VU/30s variant used for local development and PR evidence.
const stages = (peak: number) =>
  smokeMode
    ? [{ duration: '30s', target: 2 }]
    : [
        { duration: '2m', target: peak },
        { duration: '5m', target: peak },
        { duration: '1m', target: 0 },
      ];

const rampScenario = (exec: string, peak: number) => ({
  executor: 'ramping-vus' as const,
  exec,
  startVUs: 0,
  stages: stages(peak),
  gracefulRampDown: '30s',
});

export const OPTIONS = {
  scenarios: {
    planner: rampScenario('plannerJourney', 50),
    people: rampScenario('peopleJourney', 25),
    pm: rampScenario('pmJourney', 25),
    health: {
      executor: 'constant-arrival-rate' as const,
      exec: 'healthCanary',
      rate: 2,
      timeUnit: '1s',
      duration: smokeMode ? '30s' : '8m',
      preAllocatedVUs: 4,
    },
  },
  thresholds: {
    // Gate thresholds (spec §5). expected_response filters out teardown 4xx noise.
    'http_req_duration{expected_response:true}': ['p(95)<300'],
    http_req_failed: ['rate<0.001'],
    checks: ['rate>0.999'],
  },
  // Keep per-URL cardinality bounded for Prometheus remote-write.
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
} as const;
