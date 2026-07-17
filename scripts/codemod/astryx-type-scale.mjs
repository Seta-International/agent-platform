#!/usr/bin/env node
/**
 * Rewrites the type layer onto Astryx's geometric scale.
 *
 * FUT-725 deleted tokens.css, which declared the `--text-*` names below. The
 * Astryx Tailwind bridge exposes only the raw scale (xs..5xl), so every class
 * here compiles to nothing — 433 elements lost their font-size — while
 * `text-body` fell through to the colour namespace and painted text in the page
 * background. tests/unit/styles-compiled.test.ts is the guard.
 *
 * Mapping preserves RANK, not nearest pixel: Astryx's scale (10/12/14) is
 * coarser than Seta's (11/12/13), so eyebrow < caption < body is kept ordered
 * rather than collapsing two roles onto one step.
 *
 *   node scripts/codemod/astryx-type-scale.mjs <file>...
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** old class -> replacement. Longest-first at match time, so `text-body` cannot shadow `text-body-sm`. */
const CLASS_MAP = {
  'text-caption': 'text-sm', //           12px -> 12px
  'text-body-sm': 'text-base', //         13px -> 14px
  'text-body': 'text-base', //            16px -> 14px (body drops to Astryx base)
  'text-body-lg': 'text-lg', //           18px -> 17px
  'text-section-title': 'text-lg', //     17px -> 17px
  'text-card-title': 'text-2xl', //       22px -> 24px
  'text-headline': 'text-3xl', //         28px -> 29px
  'text-display-md': 'text-5xl', //       40px -> 42px
  'text-eyebrow': 'text-xs font-medium', // 11px/500 -> 10px; no call site sets a weight
  'text-muted-foreground': 'text-secondary', // dead shadcn colour, never a size
};

/** Arbitrary px sizes, snapped to the scale on the same rank logic. */
const ARBITRARY_MAP = {
  9: 'text-2xs',
  10: 'text-xs',
  10.5: 'text-xs',
  11: 'text-xs',
  11.5: 'text-sm',
  12: 'text-sm',
  12.5: 'text-sm',
  13: 'text-base',
  15: 'text-base',
  20: 'text-xl',
  26: 'text-2xl',
};

/** CardTitle and the calendar empty state relied on text-card-title's 500 weight. */
const WEIGHT_FIXES = [
  [
    "'text-card-title leading-none tracking-tight'",
    "'text-2xl font-medium leading-none tracking-tight'",
  ],
  ['"text-card-title text-primary"', '"text-2xl font-medium text-primary"'],
];

const names = Object.keys(CLASS_MAP).sort((a, b) => b.length - a.length);
const classRe = new RegExp(`(?<![-\\w])(${names.join('|')})(?![-\\w])`, 'g');
const arbitraryRe = /(?<![-\w])text-\[([0-9.]+)px\](?![-\w])/g;

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: astryx-type-scale.mjs <file>...');
  process.exit(1);
}

let classHits = 0;
let arbitraryHits = 0;
let weightHits = 0;
const unmapped = new Map();
const touched = [];

for (const file of files) {
  const before = readFileSync(file, 'utf8');
  let after = before;

  for (const [from, to] of WEIGHT_FIXES) {
    if (after.includes(from)) {
      after = after.split(from).join(to);
      weightHits++;
    }
  }

  after = after.replace(classRe, (m) => {
    classHits++;
    return CLASS_MAP[m];
  });

  after = after.replace(arbitraryRe, (m, px) => {
    const hit = ARBITRARY_MAP[Number(px)];
    if (!hit) {
      unmapped.set(m, (unmapped.get(m) ?? 0) + 1);
      return m;
    }
    arbitraryHits++;
    return hit;
  });

  if (after !== before) {
    writeFileSync(file, after);
    touched.push(file);
  }
}

console.log(`files touched:      ${touched.length}`);
console.log(`class rewrites:     ${classHits}`);
console.log(`arbitrary rewrites: ${arbitraryHits}`);
console.log(`weight fixes:       ${weightHits}`);
if (unmapped.size > 0) {
  console.log('\nUNMAPPED — reported, not skipped:');
  for (const [k, v] of [...unmapped].sort((a, b) => b[1] - a[1])) console.log(`  ${k} x${v}`);
  process.exitCode = 1;
}
