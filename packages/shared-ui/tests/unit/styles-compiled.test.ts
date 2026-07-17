import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { compile } from 'tailwindcss';
import { beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const stylesDir = resolve(__dirname, '../../src/styles');
const packagesDir = resolve(__dirname, '../../..');

async function loadStylesheet(id: string, basedir: string) {
  const path = id.startsWith('.') ? resolve(basedir, id) : require.resolve(id);
  return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * `text-*` class names used across every web package. The lookbehind rejects
 * CSS variable fragments (`var(--color-text-red)`), which are token names
 * rather than utility classes.
 */
function usedTextClasses(): Map<string, string> {
  const found = new Map<string, string>();
  const packages = readdirSync(packagesDir).filter(
    (p) => p === 'shared-ui' || p.startsWith('web-'),
  );

  for (const pkg of packages) {
    const src = join(packagesDir, pkg, 'src');
    let files: string[];
    try {
      files = sourceFiles(src);
    } catch {
      continue;
    }
    for (const file of files) {
      const content = stripComments(readFileSync(file, 'utf8'));
      for (const match of content.matchAll(/(?<![-\w])(text-[a-z][a-z0-9]*(?:-[a-z0-9]+)*)\b/g)) {
        const cls = match[1];
        if (cls && !found.has(cls)) found.set(cls, file.slice(packagesDir.length + 1));
      }
    }
  }
  return found;
}

let build: (candidates: string[]) => string;

beforeAll(async () => {
  const css = readFileSync(join(stylesDir, 'index.css'), 'utf8');
  const compiled = await compile(css, {
    base: stylesDir,
    loadStylesheet,
    loadModule: async () => {
      throw new Error('no JS modules expected in this stylesheet');
    },
  });
  build = (candidates) => compiled.build(candidates);
});

describe('compiled Tailwind output', () => {
  // FUT-725 deleted tokens.css, which declared --text-caption/--text-body-sm/etc.
  // Astryx's bridge does not redeclare them, so 397 elements silently lost their
  // font-size and `text-body` fell through to the colour namespace. Every
  // source-level gate passed. Only compiling the stylesheet catches this.
  it('generates a rule for every text-* class used in source', () => {
    const used = usedTextClasses();
    const dead: string[] = [];

    for (const [cls, where] of used) {
      const out = build([cls]);
      if (!new RegExp(`\\.${cls}\\s*\\{`).test(out)) dead.push(`${cls} (${where})`);
    }

    expect(dead).toEqual([]);
  });

  it('resolves every scale step to a font-size', () => {
    for (const cls of ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl']) {
      const rule = build([cls]).match(new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`))?.[0] ?? '';
      expect(rule, `${cls} must set font-size`).toMatch(/font-size:/);
    }
  });

  // `text-body` reads as Astryx's `body` type role, but Astryx declares no
  // --text-body — only --color-background-body — so Tailwind resolves it through
  // the colour namespace and paints text in the page background. It compiles, so
  // the dead-class check above cannot see it.
  //
  // Only `body` is trapped: it is the one name that is both a type role and a
  // background. `text-card`/`text-surface` resolve to colours too, but nobody
  // means a font-size by them — GraphNodeCard uses `text-card` deliberately for
  // light text on a dark chip.
  it('does not use text-body, which silently resolves to the page background colour', () => {
    const rule = build(['text-body']).match(/\.text-body\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule, 'precondition: text-body still resolves to a colour').toMatch(
      /color:\s*var\(--color-background-body\)/,
    );
    expect([...usedTextClasses().keys()]).not.toContain('text-body');
  });
});
