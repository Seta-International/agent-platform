import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import type { PlopTypes } from '@turbo/gen';

type WorkspaceDepsAnswers = { name: string; withWeb: boolean };

function addWorkspaceDep(packageJsonPath: string, depName: string): string {
  const raw = readFileSync(packageJsonPath, 'utf8');
  const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
  pkg.dependencies = pkg.dependencies ?? {};
  if (pkg.dependencies[depName]) return `${depName} already present in ${packageJsonPath}`;
  pkg.dependencies = Object.fromEntries(
    Object.entries({ ...pkg.dependencies, [depName]: 'workspace:^' }).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  );
  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return `added ${depName} to ${packageJsonPath}`;
}

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setActionType('addWorkspaceDeps', (answers) => {
    const { name } = answers as WorkspaceDepsAnswers;
    const dep = `@seta/${name}`;
    const targets = [
      'apps/server/package.json',
      'apps/worker/package.json',
      'apps/cli/package.json',
    ];
    const messages = targets.map((t) => addWorkspaceDep(t, dep));
    return messages.join('\n');
  });

  plop.setActionType('runPnpmInstall', () => {
    execSync('pnpm install', { stdio: 'inherit' });
    return 'pnpm install complete';
  });

  plop.setActionType('runGenRbac', () => {
    execSync('pnpm gen:rbac', { stdio: 'inherit' });
    return 'regenerated permission keys';
  });

  // The entry-point `modify` actions append each new import directly above the
  // marker comment, which leaves the import block out of alphabetical order and
  // trips Biome's organizeImports assist. Re-sort just those files so a fresh
  // scaffold passes `pnpm lint` with no manual cleanup.
  plop.setActionType('organizeEntryImports', (answers) => {
    const { withWeb } = answers as WorkspaceDepsAnswers;
    const files = [
      'apps/server/src/index.ts',
      'apps/worker/src/index.ts',
      'apps/cli/src/commands/migrate.ts',
      ...(withWeb ? ['apps/web/src/shell/manifests.ts'] : []),
    ];
    execSync(
      `pnpm exec biome check --write --linter-enabled=false --formatter-enabled=false ${files.join(' ')}`,
      { stdio: 'inherit' },
    );
    return `organized imports in ${files.length} entry-point file(s)`;
  });

  plop.setGenerator('module-scaffold', {
    description: 'Scaffold a Seta module with backend + optional same-name frontend.',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Module name (kebab-case):',
        validate: (s: string) =>
          /^[a-z][a-z0-9-]*$/.test(s) || 'must be kebab-case, lowercase letters/digits/hyphens',
      },
      {
        type: 'list',
        name: 'tier',
        message: 'Tier:',
        choices: [
          { name: 'feature (default — owns a domain)', value: 'feature' },
          { name: 'foundation (always-present; others depend on it)', value: 'foundation' },
          {
            name: 'orchestrator (composes multiple features, e.g. staffing)',
            value: 'orchestrator',
          },
        ],
        default: 'feature',
      },
      {
        type: 'confirm',
        name: 'withWeb',
        message: 'Generate apps/web/src/modules/<name>/ companion folder?',
        default: true,
      },
    ],
    actions: (data) => {
      const { name, withWeb } = (data ?? {}) as { name: string; tier: string; withWeb: boolean };
      const base = `packages/${name}`;
      const pascal = pascalCase(name);
      const camel = camelCase(name);

      const actions: PlopTypes.ActionType[] = [
        // Top-level config
        {
          type: 'add',
          path: `${base}/package.json`,
          templateFile: 'templates/module/package.json.hbs',
        },
        {
          type: 'add',
          path: `${base}/tsconfig.json`,
          templateFile: 'templates/module/tsconfig.json.hbs',
        },
        {
          type: 'add',
          path: `${base}/vitest.config.ts`,
          templateFile: 'templates/module/vitest.config.ts.hbs',
        },
        {
          type: 'add',
          path: `${base}/drizzle.config.ts`,
          templateFile: 'templates/module/drizzle.config.ts.hbs',
        },
        {
          type: 'add',
          path: `${base}/drizzle/migrations/0001_init.sql`,
          templateFile: 'templates/module/drizzle/migrations/0001_init.sql.hbs',
        },
        { type: 'add', path: `${base}/README.md`, templateFile: 'templates/module/README.md.hbs' },

        // Public surface (src root)
        {
          type: 'add',
          path: `${base}/src/index.ts`,
          templateFile: 'templates/module/src/index.ts.hbs',
        },
        {
          type: 'add',
          path: `${base}/src/events.ts`,
          templateFile: 'templates/module/src/events.ts.hbs',
        },
        {
          type: 'add',
          path: `${base}/src/rbac.ts`,
          templateFile: 'templates/module/src/rbac.ts.hbs',
        },
        {
          type: 'add',
          path: `${base}/src/contracts.ts`,
          templateFile: 'templates/module/src/contracts.ts.hbs',
        },
        {
          type: 'add',
          path: `${base}/src/register.ts`,
          templateFile: 'templates/module/src/register.ts.hbs',
        },

        // Backend internals
        {
          type: 'add',
          path: `${base}/src/backend/db/schema.ts`,
          templateFile: 'templates/module/src/backend/db/schema.ts.hbs',
        },
        {
          type: 'add',
          path: `${base}/src/backend/db/client.ts`,
          templateFile: 'templates/module/src/backend/db/client.ts.hbs',
        },
        {
          type: 'add',
          path: `${base}/src/backend/agent-tools.ts`,
          templateFile: 'templates/module/src/backend/agent-tools.ts.hbs',
        },
        {
          type: 'add',
          path: `${base}/src/backend/agent-specs.ts`,
          templateFile: 'templates/module/src/backend/agent-specs.ts.hbs',
        },

        // Backend .gitkeep markers (empty)
        { type: 'add', path: `${base}/src/backend/domain/.gitkeep`, template: '' },
        { type: 'add', path: `${base}/src/backend/subscribers/.gitkeep`, template: '' },
        { type: 'add', path: `${base}/src/backend/jobs/.gitkeep`, template: '' },
        { type: 'add', path: `${base}/src/backend/http/.gitkeep`, template: '' },
        { type: 'add', path: `${base}/src/backend/stream/.gitkeep`, template: '' },
        { type: 'add', path: `${base}/src/backend/workflows/.gitkeep`, template: '' },

        // Public-surface smoke test
        {
          type: 'add',
          path: `${base}/tests/contract/loads.test.ts`,
          templateFile: 'templates/module/tests/contract/loads.test.ts.hbs',
        },

        // Entry-point edits: apps/server
        {
          type: 'modify',
          path: 'apps/server/src/index.ts',
          pattern: /(\/\/ MODULE_IMPORTS_END)/,
          template: `import { register${pascal}Contributions } from '@seta/${name}/register';\n$1`,
        },
        {
          type: 'modify',
          path: 'apps/server/src/index.ts',
          pattern: /(\/\/ MODULE_REGISTRATIONS_END)/,
          template: `register${pascal}Contributions(reg);\n$1`,
        },

        // Entry-point edits: apps/worker
        {
          type: 'modify',
          path: 'apps/worker/src/index.ts',
          pattern: /(\/\/ MODULE_IMPORTS_END)/,
          template: `import { register${pascal}Contributions } from '@seta/${name}/register';\n$1`,
        },
        {
          type: 'modify',
          path: 'apps/worker/src/index.ts',
          pattern: /(\/\/ MODULE_REGISTRATIONS_END)/,
          template: `register${pascal}Contributions(reg);\n$1`,
        },

        // Entry-point edits: apps/cli migrate command (registrations are indented inside a function)
        {
          type: 'modify',
          path: 'apps/cli/src/commands/migrate.ts',
          pattern: /(\/\/ MODULE_IMPORTS_END)/,
          template: `import { register${pascal}Contributions } from '@seta/${name}/register';\n$1`,
        },
        {
          type: 'modify',
          path: 'apps/cli/src/commands/migrate.ts',
          pattern: /( {2}\/\/ MODULE_REGISTRATIONS_END)/,
          template: `  register${pascal}Contributions(reg);\n$1`,
        },
      ];

      if (withWeb) {
        const webBase = `apps/web/src/modules/${name}`;
        actions.push(
          {
            type: 'add',
            path: `${webBase}/index.ts`,
            templateFile: 'templates/module-web/index.ts.hbs',
          },
          {
            type: 'add',
            path: `${webBase}/manifest.ts`,
            templateFile: 'templates/module-web/manifest.ts.hbs',
          },
          { type: 'add', path: `${webBase}/api/.gitkeep`, template: '' },
          { type: 'add', path: `${webBase}/components/.gitkeep`, template: '' },
          { type: 'add', path: `${webBase}/hooks/.gitkeep`, template: '' },
          { type: 'add', path: `${webBase}/state/.gitkeep`, template: '' },
          // Minimal visible page + TanStack route so a fresh module renders an
          // empty page at /<name> immediately after scaffolding.
          {
            type: 'add',
            path: `${webBase}/pages/${name}-page.tsx`,
            templateFile: 'templates/module-web/page.tsx.hbs',
          },
          {
            type: 'add',
            path: `apps/web/src/routes/_authed/${name}.tsx`,
            templateFile: 'templates/module-web/route.tsx.hbs',
          },
          {
            type: 'modify',
            path: 'apps/web/src/shell/manifests.ts',
            pattern: /(\/\/ MODULE_MANIFEST_IMPORTS_END)/,
            template: `import { ${camel}NavManifest } from '@/modules/${name}';\n$1`,
          },
          {
            type: 'modify',
            path: 'apps/web/src/shell/manifests.ts',
            pattern: /( {2}\/\/ MODULE_MANIFEST_REGISTRATIONS_END)/,
            template: `  ${camel}NavManifest,\n$1`,
          },
        );
      }

      actions.push(
        { type: 'organizeEntryImports' },
        { type: 'addWorkspaceDeps' },
        { type: 'runPnpmInstall' },
        { type: 'runGenRbac' },
      );

      return actions;
    },
  });
}

function pascalCase(s: string): string {
  return s
    .split('-')
    .map((p) => (p ? `${p[0]?.toUpperCase() ?? ''}${p.slice(1)}` : ''))
    .join('');
}

function camelCase(s: string): string {
  const pascal = pascalCase(s);
  return pascal ? `${pascal[0]?.toLowerCase() ?? ''}${pascal.slice(1)}` : '';
}
