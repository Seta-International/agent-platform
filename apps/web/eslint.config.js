import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'src/routeTree.gen.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['src/routes/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'shell', pattern: 'src/shell/**' },
        { type: 'routes', pattern: 'src/routes/**' },
        { type: 'module', pattern: 'src/modules/*', mode: 'folder', capture: ['module'] },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: { type: 'shell' }, allow: [{ to: { type: '@seta/shared-ui' } }] },
            {
              from: { type: 'routes' },
              allow: [{ to: { type: 'shell' } }, { to: { type: '@seta/shared-ui' } }],
            },
            // Identity's admin role-grant dialog reads the planner group list to pick role scopes.
            // Narrowed allowance; nothing else may cross modules.
            {
              from: { type: 'module', captured: { module: 'identity' } },
              allow: [
                { to: { type: '@seta/shared-ui' } },
                { to: { type: 'module', captured: { module: 'planner' } } },
              ],
            },
            // Console is the tenant-admin aggregator: it composes user-facing pages from
            // every other module's contracts and UI primitives. Cross-module imports
            // from console into peers are the intended shape, not a violation.
            {
              from: { type: 'module', captured: { module: 'console' } },
              allow: [{ to: { type: '@seta/shared-ui' } }, { to: { type: 'module' } }],
            },
            // Planner's nav manifest invokes useSession to read tenant_id when
            // computing recent-plans dynamic entries. Session shape lives in identity.
            {
              from: { type: 'module', captured: { module: 'planner' } },
              allow: [
                { to: { type: '@seta/shared-ui' } },
                { to: { type: 'module', captured: { module: 'identity' } } },
              ],
            },
            { from: { type: 'module' }, allow: [{ to: { type: '@seta/shared-ui' } }] },
          ],
        },
      ],
    },
  },
]);
