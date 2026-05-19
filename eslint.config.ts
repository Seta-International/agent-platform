import { boundariesConfig } from '@seta/shared-config/eslint/boundaries';

export default [
  {
    ignores: ['**/dist/**', '**/build/**', '**/.turbo/**', '**/node_modules/**', 'pnpm-lock.yaml'],
  },
  ...boundariesConfig,
];
