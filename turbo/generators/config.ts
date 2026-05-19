import type { PlopTypes } from '@turbo/gen';

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('module-scaffold', {
    description: 'Scaffold a Seta module package with src/{backend,public,events,db}/index.ts',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Package name (e.g. core, planner, cli):',
        validate: (input: string) =>
          /^[a-z][a-z0-9-]*$/.test(input) || 'must be kebab-case, lowercase letters/digits/hyphens',
      },
      {
        type: 'list',
        name: 'kind',
        message: 'Package kind:',
        choices: [
          {
            name: 'module (packages/<name>, src/{backend,public,events,db}/index.ts)',
            value: 'module',
          },
          { name: 'app-cli (apps/<name>, src/index.ts only)', value: 'app-cli' },
        ],
      },
    ],
    actions: (data) => {
      const kind = data?.kind as 'module' | 'app-cli';
      const base = kind === 'module' ? 'packages/{{name}}' : 'apps/{{name}}';
      const tmplBase = kind === 'module' ? 'module' : 'app-cli';

      const actions: PlopTypes.ActionType[] = [
        {
          type: 'add',
          path: `${base}/package.json`,
          templateFile: `templates/${tmplBase}/package.json.hbs`,
        },
        {
          type: 'add',
          path: `${base}/tsconfig.json`,
          templateFile: `templates/${tmplBase}/tsconfig.json.hbs`,
        },
      ];

      if (kind === 'module') {
        actions.push({
          type: 'add',
          path: `${base}/src/index.ts`,
          templateFile: `templates/module/src/index.ts.hbs`,
        });
        for (const sub of ['backend', 'events', 'db']) {
          actions.push({
            type: 'add',
            path: `${base}/src/${sub}/index.ts`,
            templateFile: `templates/module/src/${sub}/index.ts.hbs`,
          });
        }
      } else {
        actions.push({
          type: 'add',
          path: `${base}/src/index.ts`,
          templateFile: `templates/app-cli/src/index.ts.hbs`,
        });
      }

      return actions;
    },
  });
}
