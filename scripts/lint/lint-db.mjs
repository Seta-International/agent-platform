// scripts/lint/lint-db.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE_PATH = 'scripts/lint/lint-db-baseline.json';
const UPDATE = process.argv.includes('--update-baseline');

// spec §3.1 global-table allowlist + projection/junction shapes exempt from single rules
const NO_TENANT_ALLOWLIST = new Set([
  'tenants',
  'agent_eval_run',
  'agent_eval_score',
  'subscription_cursors',
  'subscription_processed',
  'subscription_dead_letter',
  'subscription_failure_state',
  'rpc_idempotency',
  'session',
  'account',
  'verification',
  'rate_limit',
  'failed_login_attempts',
  'failed_login_alerts_sent',
]);

function* schemaFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      yield* schemaFiles(p);
    } else if (/(^|\/)db\/schema(\.[\w-]+)?\.ts$/.test(p) || /\/db\/schema\/[\w-]+\.ts$/.test(p)) {
      yield p;
    }
  }
}

function tableBlocks(source) {
  const blocks = [];
  const re = /\.table\(\s*'([a-z0-9_]+)'/g;
  let m = re.exec(source);
  while (m !== null) {
    const start = m.index;
    const name = m[1];
    const next = re.exec(source);
    blocks.push({ name, body: source.slice(start, next ? next.index : source.length) });
    m = next;
  }
  return blocks;
}

const violations = [];
for (const file of schemaFiles('packages')) {
  const src = readFileSync(file, 'utf8');
  if (!file.startsWith('packages/shared-db/') && /text\(\s*'[\w]+'\s*,\s*\{\s*enum\s*:/.test(src)) {
    violations.push(`R2:${file}:inline-text-enum`);
  }
  for (const { name, body } of tableBlocks(src)) {
    if (!NO_TENANT_ALLOWLIST.has(name) && !/tenant_id/.test(body)) {
      violations.push(`R1:${file}:${name}`);
    }
    if (!/created_at|createdAt/.test(body)) violations.push(`R4:${file}:${name}`);
    for (const uniq of body.matchAll(/uniqueIndex\([^)]*\)\s*\.on\(\s*([\w.]+)/g)) {
      if (!/\.(tenant_id|tenantId)$/.test(uniq[1]) && !NO_TENANT_ALLOWLIST.has(name)) {
        violations.push(`R3:${file}:${name}:${uniq[1]}`);
      }
    }
  }
}
violations.sort();

if (UPDATE) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(violations, null, 2)}\n`);
  console.log(`lint-db: baseline updated (${violations.length} entries)`);
  process.exit(0);
}

const baseline = new Set(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')));
const fresh = violations.filter((v) => !baseline.has(v));
const stale = [...baseline].filter((b) => !violations.includes(b));
if (fresh.length > 0) {
  console.error(`lint-db: ${fresh.length} new violation(s):\n${fresh.join('\n')}`);
}
if (stale.length > 0) {
  console.error(
    `lint-db: ${stale.length} baseline entr(ies) no longer occur — remove them (shrink-only ratchet):\n${stale.join('\n')}`,
  );
}
process.exit(fresh.length > 0 || stale.length > 0 ? 1 : 0);
