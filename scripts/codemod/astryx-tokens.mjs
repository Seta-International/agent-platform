#!/usr/bin/env node
import { execSync } from 'node:child_process';
/**
 * FUT-725: rewrites Seta's Tailwind colour classes onto Astryx's, so the
 * `@theme` block in tokens.css can be replaced by Astryx's Tailwind bridge.
 *
 *   node scripts/codemod/astryx-tokens.mjs --check   # report only, no writes
 *   node scripts/codemod/astryx-tokens.mjs           # apply
 *
 * Two failure modes this is built to avoid, both of which produce output that
 * compiles and looks plausible:
 *
 *   Cascade — sequential passes compound. `ink -> primary` followed by
 *   `primary -> accent` turns everything into accent. So this resolves every
 *   match through one lookup in ONE pass; it never rewrites its own output.
 *
 *   Prefix shadowing — `ink -> primary` applied before `ink-muted -> secondary`
 *   yields `primary-muted`. So alternatives are ordered longest-first.
 *
 * Anything matching a Seta colour token with no mapping is REPORTED and left
 * alone. Silent pass-through is how a token survives the flip.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** Utility prefixes Tailwind generates from a --color-* theme variable. */
const PREFIXES = [
  'text',
  'bg',
  'border',
  'ring',
  'fill',
  'stroke',
  'from',
  'to',
  'via',
  'divide',
  'outline',
  'decoration',
  'caret',
  'placeholder',
  'accent',
  'shadow',
];

/** Prefixes that paint glyphs rather than surfaces — they take the "text" tone. */
const INK_PREFIX = new Set(['text', 'fill', 'stroke', 'decoration', 'caret', 'placeholder']);

/**
 * Seta colour token -> Astryx colour token.
 * A function receives the utility prefix when the target depends on it.
 */
const MAP = {
  // Ink ramp: 4 steps -> 3. muted and subtle both land on secondary.
  ink: 'primary',
  'ink-muted': 'secondary',
  'ink-subtle': 'secondary',
  'ink-tertiary': 'disabled',

  // Surface ladder: 5 steps -> Astryx's purpose-named surfaces.
  canvas: 'body',
  'surface-1': 'card',
  'surface-2': 'surface',
  'surface-3': 'surface',
  'surface-4': 'surface',

  // Hairlines: 3 -> 2.
  hairline: 'border',
  'hairline-tertiary': 'border',
  'hairline-strong': 'border-strong',

  // Brand accent. Bare `accent` is bound to --color-text-accent, so surfaces
  // must use `accent-bg`; this is the pair the flip most easily gets wrong.
  primary: (p) => (INK_PREFIX.has(p) ? 'accent' : 'accent-bg'),
  'primary-ink': () => 'accent',
  'primary-tint': () => 'accent-muted',
  'primary-border': () => 'accent-bg',
  'primary-hover': () => 'accent-bg',
  'primary-focus': () => 'accent-bg',
  'on-primary': 'on-accent',

  // Danger/destructive collapse onto Astryx's single error family.
  danger: 'error',
  'danger-ink': 'error',
  'danger-tint': 'error-muted',
  destructive: 'error',
  'destructive-tint': 'error-muted',
  'on-destructive': 'on-error',
  'semantic-danger': 'error',
  'semantic-danger-tint': 'error-muted',

  warning: 'warning',
  'warning-ink': 'warning',
  'warning-tint': 'warning-muted',
  'semantic-warning': 'warning',
  'semantic-warning-tint': 'warning-muted',

  success: 'success',
  'success-ink': 'success',
  'success-tint': 'success-muted',
  'semantic-success': 'success',
  'semantic-success-tint': 'success-muted',

  // Astryx has no info family; the blue hue carries it.
  info: (p) => (INK_PREFIX.has(p) ? 'blue-vivid' : p === 'border' ? 'blue-ring' : 'blue-subtle'),
  'info-ink': () => 'blue-vivid',
  'info-tint': () => 'blue-subtle',

  'semantic-overlay': 'overlay',
};

/**
 * Seta token -> Astryx SYSTEM token, for direct `var(--color-*)` references in
 * StyleX/inline styles and CSS. These name the system tokens, not the Tailwind
 * bridge aliases above: the bridge exists only to feed utility generation.
 */
const VAR_MAP = {
  ink: 'text-primary',
  'ink-muted': 'text-secondary',
  'ink-subtle': 'text-secondary',
  'ink-tertiary': 'text-disabled',

  canvas: 'background-body',
  'surface-1': 'background-card',
  'surface-2': 'background-surface',
  'surface-3': 'background-surface',
  'surface-4': 'background-surface',

  hairline: 'border',
  'hairline-tertiary': 'border',
  'hairline-strong': 'border-emphasized',

  primary: 'accent',
  'primary-ink': 'text-accent',
  'primary-tint': 'accent-muted',
  'primary-hover': 'accent',
  'primary-focus': 'accent',
  'on-primary': 'on-accent',

  danger: 'error',
  'danger-ink': 'text-red',
  'danger-tint': 'error-muted',
  destructive: 'error',
  'destructive-tint': 'error-muted',
  'on-destructive': 'on-error',
  'semantic-danger': 'error',
  'semantic-danger-tint': 'error-muted',

  warning: 'warning',
  'warning-ink': 'text-yellow',
  'warning-tint': 'warning-muted',
  'semantic-warning': 'warning',
  'semantic-warning-tint': 'warning-muted',

  success: 'success',
  'success-ink': 'text-green',
  'success-tint': 'success-muted',
  'semantic-success': 'success',
  'semantic-success-tint': 'success-muted',

  info: 'icon-blue',
  'info-ink': 'text-blue',
  'info-tint': 'background-blue',

  'semantic-overlay': 'overlay',

  'priority-urgent': 'icon-red',
  'priority-urgent-tint': 'background-red',
  'priority-urgent-ink': 'text-red',
  'priority-important': 'icon-orange',
  'priority-important-tint': 'background-orange',
  'priority-important-ink': 'text-orange',
  'priority-medium': 'icon-blue',
  'priority-medium-tint': 'background-blue',
  'priority-medium-ink': 'text-blue',
  'priority-low': 'icon-gray',
  'priority-low-tint': 'background-gray',
  'priority-low-ink': 'text-gray',

  // Group themes were named after hues Astryx already ships, so they map 1:1.
  'group-theme-teal': 'icon-teal',
  'group-theme-purple': 'icon-purple',
  'group-theme-green': 'icon-green',
  'group-theme-blue': 'icon-blue',
  'group-theme-pink': 'icon-pink',
  'group-theme-orange': 'icon-orange',
  'group-theme-red': 'icon-red',
};

/**
 * Non-colour tokens the legacy `@theme` declared, mapped onto Astryx's scales.
 * Spacing is exact (Seta's named steps sat on the same 4px grid); the two type
 * sizes shift by ~1px, which the flip accepts.
 */
const MISC_VAR_MAP = {
  '--font-text': '--font-family-body',
  '--font-display': '--font-family-heading',
  '--font-mono': '--font-family-code',
  '--spacing-xxs': '--spacing-1', // 4px
  '--spacing-xs': '--spacing-2', // 8px
  '--spacing-sm': '--spacing-3', // 12px
  '--spacing-md': '--spacing-4', // 16px
  '--spacing-lg': '--spacing-6', // 24px
  '--spacing-xl': '--spacing-8', // 32px
  '--spacing-xxl': '--spacing-12', // 48px
  '--text-body-sm': '--font-size-sm', // 13px -> 12px
  '--text-body-lg': '--font-size-lg', // 18px -> 17px
};

/**
 * Every colour token the legacy `@theme` block declared, pinned here because the
 * block itself is deleted by this migration. Used to report tokens neither map
 * covers, which would otherwise survive the flip silently.
 */
const SETA_TOKENS = [
  'canvas',
  'danger',
  'danger-ink',
  'danger-tint',
  'destructive',
  'destructive-tint',
  'group-theme-blue',
  'group-theme-green',
  'group-theme-orange',
  'group-theme-pink',
  'group-theme-purple',
  'group-theme-red',
  'group-theme-teal',
  'hairline',
  'hairline-strong',
  'hairline-tertiary',
  'info',
  'info-ink',
  'info-tint',
  'ink',
  'ink-muted',
  'ink-subtle',
  'ink-tertiary',
  'on-destructive',
  'on-primary',
  'primary',
  'primary-border',
  'primary-focus',
  'primary-hover',
  'primary-ink',
  'primary-tint',
  'priority-important',
  'priority-important-ink',
  'priority-important-tint',
  'priority-low',
  'priority-low-ink',
  'priority-low-tint',
  'priority-medium',
  'priority-medium-ink',
  'priority-medium-tint',
  'priority-urgent',
  'priority-urgent-ink',
  'priority-urgent-tint',
  'semantic-overlay',
  'semantic-success',
  'semantic-success-tint',
  'semantic-warning',
  'semantic-warning-tint',
  'success',
  'success-ink',
  'success-tint',
  'surface-1',
  'surface-2',
  'surface-3',
  'surface-4',
  'warning',
  'warning-ink',
  'warning-tint',
];

/**
 * The class pass is NOT safe to run twice: `ink` maps to `primary`, but `primary`
 * is itself a key (Seta's brand blue -> accent). A second pass would read the
 * `primary` this produced as brand blue and rewrite it to `accent`. Once the
 * stylesheet no longer declares the Seta ramp, the flip has landed and there is
 * nothing left to migrate.
 */
function alreadyFlipped() {
  return !readFileSync('packages/shared-ui/src/styles/index.css', 'utf8').includes('@theme');
}

function resolve(prefix, token) {
  const t = MAP[token];
  if (t === undefined) return null;
  return typeof t === 'function' ? t(prefix) : t;
}

const check = process.argv.includes('--check');
const known = new Set(SETA_TOKENS);

// The var() pass is safe to repeat — no Astryx system token shares a name with a
// Seta one, so it cannot rewrite its own output. Only the class pass cascades.
const classPassSafe = !alreadyFlipped();

// Longest-first so `ink-muted` is tried before `ink`.
const names = Object.keys(MAP).sort((a, b) => b.length - a.length);
const RE = new RegExp(`\\b(${PREFIXES.join('|')})-(${names.join('|')})(?![a-z0-9-])`, 'g');
// Any Seta colour token, so we can report the ones MAP does not cover.
const ALL = new RegExp(
  `\\b(${PREFIXES.join('|')})-(${[...known].sort((a, b) => b.length - a.length).join('|')})(?![a-z0-9-])`,
  'g',
);

// `var(--color-X)` references, in TS/TSX (StyleX, inline styles) and CSS.
const varNames = Object.keys(VAR_MAP).sort((a, b) => b.length - a.length);
const VAR_RE = new RegExp(`--color-(${varNames.join('|')})(?![a-z0-9-])`, 'g');
const VAR_ALL = new RegExp(
  `--color-(${[...known].sort((a, b) => b.length - a.length).join('|')})(?![a-z0-9-])`,
  'g',
);
const MISC_RE = new RegExp(
  `(${Object.keys(MISC_VAR_MAP)
    .sort((a, b) => b.length - a.length)
    .join('|')})(?![a-z0-9-])`,
  'g',
);

const files = execSync(
  `grep -rl --include='*.tsx' --include='*.ts' --include='*.css' -E '(${PREFIXES.join('|')})-|--color-' packages/*/src apps/web/src`,
  { encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .filter(Boolean);

let changed = 0;
let rewrites = 0;
let varRewrites = 0;
const unmapped = new Map();

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  // ONE pass per surface. The replacer never re-examines what it just produced.
  let out = classPassSafe
    ? src.replace(RE, (whole, prefix, token) => {
        const target = resolve(prefix, token);
        if (target === null) return whole;
        rewrites++;
        return `${prefix}-${target}`;
      })
    : src;
  out = out.replace(VAR_RE, (whole, token) => {
    const target = VAR_MAP[token];
    if (target === undefined) return whole;
    varRewrites++;
    return `--color-${target}`;
  });
  out = out.replace(MISC_RE, (whole) => {
    const target = MISC_VAR_MAP[whole];
    if (target === undefined) return whole;
    varRewrites++;
    return target;
  });

  for (const m of out.matchAll(ALL)) {
    if (resolve(m[1], m[2]) !== null) continue;
    const k = `${m[1]}-${m[2]}`;
    if (!unmapped.has(k)) unmapped.set(k, new Set());
    unmapped.get(k).add(file);
  }
  for (const m of out.matchAll(VAR_ALL)) {
    if (VAR_MAP[m[1]] !== undefined) continue;
    const k = `var(--color-${m[1]})`;
    if (!unmapped.has(k)) unmapped.set(k, new Set());
    unmapped.get(k).add(file);
  }

  if (out !== src) {
    changed++;
    if (!check) writeFileSync(file, out);
  }
}

console.log(
  `${check ? 'would rewrite' : 'rewrote'} ${rewrites} class(es) + ${varRewrites} var() ref(s) across ${changed} file(s)`,
);

if (unmapped.size) {
  console.log('\nUNMAPPED Seta colour tokens — these will break at the flip:');
  for (const [k, fs] of [...unmapped].sort()) {
    console.log(`  ${k.padEnd(34)} ${fs.size} file(s)  e.g. ${[...fs][0]}`);
  }
  process.exit(1);
}
console.log('no unmapped Seta colour tokens remain');
