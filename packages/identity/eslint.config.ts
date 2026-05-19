import { boundariesConfig } from '@seta/shared-config/eslint/boundaries';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'drizzle/**'],
  },
  ...boundariesConfig,
];
