#!/usr/bin/env node
// stress-pool.mjs — DB connection pool stress test via HTTP.
//
// Fires concurrent HTTP requests to the running server's /health/ready
// endpoint. Each request hits the database through the instrumented pool,
// so you can watch the OTEL metrics rise and fall in Grafana.
//
// Usage:
//   node scripts/stress-pool.mjs
//   SERVER_URL=http://localhost:3000 CONCURRENCY=50 DURATION_S=60 node scripts/stress-pool.mjs
//
// Before running:
//   1. docker compose -f infra/docker/compose.dev.yml up -d prometheus grafana
//   2. pnpm dev   (starts server on :3000 with PrometheusExporter on :9464)
//   3. node scripts/stress-pool.mjs
//   4. Open Grafana at http://localhost:3100  (admin / admin)
//      Explore → Prometheus → platform_db_pool_*

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 30);
const DURATION_S = Number(process.env.DURATION_S ?? 30);

console.log(`
  stress-pool — DB connection pool stress test (HTTP)
  ────────────────────────────────────────────────────
  TARGET      : ${SERVER_URL}/health/ready
  CONCURRENCY : ${CONCURRENCY} workers
  DURATION    : ${DURATION_S}s

  Grafana     : http://localhost:3100  (admin / admin)
  Prometheus  : http://localhost:9090
  Metrics ns  : platform_db_pool_*
`);

// ── Metrics ───────────────────────────────────────────────────────────────────
let completed = 0;
let errors = 0;
let totalMs = 0;
let maxMs = 0;

// ── Worker loop ───────────────────────────────────────────────────────────────
async function worker() {
  const deadline = Date.now() + DURATION_S * 1_000;
  while (Date.now() < deadline) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${SERVER_URL}/health/ready`);
      if (!res.ok && res.status !== 503) throw new Error(`HTTP ${res.status}`);
      const ms = Date.now() - t0;
      completed++;
      totalMs += ms;
      if (ms > maxMs) maxMs = ms;
    } catch {
      errors++;
    }
  }
}

// ── Progress printer ──────────────────────────────────────────────────────────
const startAt = Date.now();
const progress = setInterval(() => {
  const elapsed = ((Date.now() - startAt) / 1000).toFixed(1);
  const avg = completed > 0 ? (totalMs / completed).toFixed(1) : '—';
  const rps = (completed / Number(elapsed)).toFixed(1);
  console.log(
    `  ${elapsed}s | reqs: ${completed} (${rps} rps) | errors: ${errors} | avg: ${avg}ms | max: ${maxMs}ms`,
  );
}, 2_000);

// ── Warmup check ─────────────────────────────────────────────────────────────
try {
  const warmup = await fetch(`${SERVER_URL}/health/live`);
  if (!warmup.ok) throw new Error(`server returned ${warmup.status}`);
  console.log('  server reachable — starting stress...\n');
} catch (_err) {
  console.error(`\n  ERROR: cannot reach ${SERVER_URL}/health/live`);
  console.error(`  Is the server running? Start it with: pnpm --filter @seta/server dev\n`);
  process.exit(1);
}

// ── Run ───────────────────────────────────────────────────────────────────────
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
clearInterval(progress);

console.log(`
  ────────────────────────────────────────────────────
  done — ${completed} requests in ${DURATION_S}s
  errors    : ${errors}
  avg time  : ${completed > 0 ? (totalMs / completed).toFixed(1) : '—'}ms
  max time  : ${maxMs}ms
  rps       : ${(completed / DURATION_S).toFixed(1)}
`);
