#!/usr/bin/env node
// Merges a telemetry `env` block into ~/.claude/settings.json. Runs from postinstall on
// macOS/Ubuntu/Windows and must never fail an install: every exit path is 0.
// Content knobs are written as explicit "0" so an upstream default change cannot start
// shipping prompt text. Opt out with SETA_TELEMETRY_OPTOUT=1.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';

const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');
const ENDPOINT = 'https://future-ingest.seta-international.com';
const MARKER = 'SETA_TELEMETRY_MANAGED';

// Keys this script owns; everything else in `env` is the developer's and is preserved.
const MANAGED_KEYS = [
  MARKER,
  'CLAUDE_CODE_ENABLE_TELEMETRY',
  'OTEL_METRICS_EXPORTER',
  'OTEL_LOGS_EXPORTER',
  'OTEL_EXPORTER_OTLP_PROTOCOL',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_EXPORTER_OTLP_HEADERS',
  'OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE',
  'OTEL_LOG_USER_PROMPTS',
  'OTEL_LOG_ASSISTANT_RESPONSES',
  'OTEL_LOG_TOOL_CONTENT',
  'OTEL_LOG_TOOL_DETAILS',
  'OTEL_LOG_RAW_API_BODIES',
  'OTEL_RESOURCE_ATTRIBUTES',
];

const say = (msg) => process.stdout.write(`[telemetry] ${msg}\n`);

// The team shares one Claude login, so the native user_email is identical for everyone.
function gitEmail() {
  try {
    return execFileSync('git', ['config', '--get', 'user.email'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function readSettings() {
  try {
    const parsed = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
    // A settings.json that is valid JSON but not an object would be clobbered by a merge.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    return null; // unreadable or malformed — never overwrite what we cannot parse
  }
}

function write(settings) {
  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`);
}

/** Lets anyone see exactly what their machine reports, without reading JSON by hand. */
function status() {
  const settings = readSettings();
  const env = settings?.env ?? {};
  if (!(MARKER in env)) {
    say('off — this machine is not reporting Claude Code usage');
    return;
  }
  say(`on — reporting to ${env.OTEL_EXPORTER_OTLP_ENDPOINT}`);
  say(`  identity:  ${env.OTEL_RESOURCE_ATTRIBUTES}`);
  say(`  content:   prompts/responses/tool-io/raw-bodies all disabled`);
  say(`  settings:  ${SETTINGS_PATH}`);
  say(`  opt out:   SETA_TELEMETRY_OPTOUT=1 pnpm install`);
}

function main() {
  if (process.argv.includes('--status')) return status();

  // CI runs install on throwaway containers; that usage is not a person's usage.
  if (process.env.CI) return;

  const settings = readSettings();
  if (settings === null) {
    say(
      `skipped: ${SETTINGS_PATH} is missing or not valid JSON — fix it, then re-run \`pnpm install\``,
    );
    return;
  }

  const env = { ...(settings.env ?? {}) };

  if (process.env.SETA_TELEMETRY_OPTOUT === '1') {
    if (!(MARKER in env)) return;
    for (const key of MANAGED_KEYS) delete env[key];
    if (Object.keys(env).length > 0) settings.env = env;
    else delete settings.env;
    write(settings);
    say('opted out — telemetry settings removed');
    return;
  }

  // Basic-auth credential for the ingest proxy. Without it the exporter would retry
  // against a 401 forever, so configure nothing rather than half-configure.
  const token = process.env.SETA_TELEMETRY_TOKEN;
  if (!token) {
    if (MARKER in env) return; // already configured on an earlier run
    say('skipped: SETA_TELEMETRY_TOKEN not set — see docs/hosting/dev-telemetry.md');
    return;
  }

  settings.env = {
    ...env,
    [MARKER]: '1',
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
    OTEL_EXPORTER_OTLP_ENDPOINT: ENDPOINT,
    OTEL_EXPORTER_OTLP_HEADERS: `Authorization=Basic ${token}`,
    // Delta (the default) is rejected by Prometheus while still answering 200 — the
    // metrics vanish silently.
    OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: 'cumulative',
    OTEL_LOG_USER_PROMPTS: '0',
    OTEL_LOG_ASSISTANT_RESPONSES: '0',
    OTEL_LOG_TOOL_CONTENT: '0',
    OTEL_LOG_TOOL_DETAILS: '0',
    OTEL_LOG_RAW_API_BODIES: '0',
    OTEL_RESOURCE_ATTRIBUTES: `dev.email=${gitEmail() || 'unknown'},dev.os_user=${userInfo().username}`,
  };

  write(settings);
  say(`usage metrics on — metadata only, no prompt or code content.`);
  say(
    `  what & why: docs/hosting/dev-telemetry.md · opt out: SETA_TELEMETRY_OPTOUT=1 pnpm install`,
  );
}

try {
  main();
} catch (err) {
  // An install must never break because telemetry setup failed.
  say(`skipped: ${err.message}`);
}
