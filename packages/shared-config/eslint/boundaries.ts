import type { Linter } from 'eslint';
import boundariesPlugin from 'eslint-plugin-boundaries';

export const boundariesConfig: Linter.Config[] = [
  {
    plugins: { boundaries: boundariesPlugin },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'apps/*' },
        { type: 'module', pattern: 'packages/{core,identity,planner,copilot,integrations}/*' },
        { type: 'shared', pattern: 'packages/shared-*' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'warn',
        {
          default: 'disallow',
          rules: [
            {
              from: { type: 'app' },
              allow: [{ to: { type: 'module' } }, { to: { type: 'shared' } }],
            },
            { from: { type: 'module' }, allow: [{ to: { type: 'shared' } }] },
            { from: { type: 'shared' }, allow: [{ to: { type: 'shared' } }] },
          ],
        },
      ],
    },
  },
];

export default boundariesConfig;
