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
        { type: 'sdk', pattern: 'sdks/*' },
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
              allow: [
                { to: { type: 'module' } },
                { to: { type: 'shared' } },
                { to: { type: 'sdk' } },
              ],
            },
            {
              from: { type: 'module' },
              allow: [{ to: { type: 'shared' } }, { to: { type: 'sdk' } }],
            },
            { from: { type: 'shared' }, allow: [{ to: { type: 'shared' } }] },
            { from: { type: 'sdk' }, allow: [{ to: { type: 'sdk' } }] },
          ],
        },
      ],
    },
  },
];

export default boundariesConfig;
