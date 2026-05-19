import type { Linter } from 'eslint';
import boundariesPlugin from 'eslint-plugin-boundaries';

export const boundariesConfig: Linter.Config[] = [
  {
    plugins: { boundaries: boundariesPlugin },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'apps/*' },
        { type: 'module', pattern: 'packages/{core,identity,planner,copilot,integrations}/*' },
        { type: 'shared', pattern: 'packages/shared/*' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'warn',
        {
          default: 'disallow',
          rules: [
            { from: 'app', allow: ['module', 'shared'] },
            { from: 'module', allow: ['shared'] },
            { from: 'shared', allow: ['shared'] },
          ],
        },
      ],
    },
  },
];

export default boundariesConfig;
