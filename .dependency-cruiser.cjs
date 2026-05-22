/** Dependency-cruiser config — module boundary gate. */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      comment: 'Circular imports tend to bite. Refactor to break the cycle.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-test',
      severity: 'error',
      comment: "Don't import test sources from production code.",
      from: { pathNot: '\\.(spec|test)\\.[jt]sx?$' },
      to: { path: '\\.(spec|test)\\.[jt]sx?$' },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        "A feature module's internals (src/backend, src/db) are private. Cross-module imports must enter via the package root (src/index.ts) or the /events subpath.",
      from: { path: '^packages/(core|identity|planner|copilot|integrations)/src/' },
      to: {
        path: '^packages/(core|identity|planner|copilot|integrations)/src/(backend|db)/',
        pathNot: '^packages/$1/src/',
      },
    },
    {
      name: 'no-app-to-app-imports',
      severity: 'warn',
      comment: 'Apps must not import each other.',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/([^/]+)/', pathNot: '^apps/$1/' },
    },
    {
      name: 'only-server-imports-backend',
      severity: 'warn',
      // apps/cli is an ops/admin tool that legitimately needs access to backend domain ops; it doesn't ship to end users.
      comment:
        "A module's /backend subpath is private to apps/server, apps/cli (ops/admin tool), and the module itself.",
      from: {
        path: '^(?:packages|apps)/([^/]+)/',
        pathNot: '^apps/(server|cli)/src/',
      },
      to: {
        path: '^packages/(core|identity|planner|copilot|integrations)/src/backend/',
        pathNot: '^packages/$1/',
      },
    },
    {
      name: 'no-deep-shared-imports',
      severity: 'warn',
      comment: 'Outside shared/<x>, never reach into its internals.',
      from: { pathNot: '^packages/shared-([^/]+)/' },
      to: { path: '^packages/shared-([^/]+)/src/internals/' },
    },
    {
      name: 'shared-must-not-import-modules',
      severity: 'error',
      comment: 'shared/* may not import from feature modules. They are pure infrastructure.',
      from: { path: '^packages/shared-' },
      to: { path: '^packages/(core|identity|planner|copilot|integrations)/' },
    },
    {
      name: 'shared-cross-imports-restricted',
      severity: 'error',
      comment:
        'shared/<a> may not import from shared/<b>. shared/testing is the exception (it may import any shared/*; any shared/* may import shared/testing from test files).',
      from: {
        path: '^packages/shared-(?!testing)([^/]+)/',
        pathNot: '(^|/)(__tests__|test)/',
      },
      to: {
        path: '^packages/shared-([^/]+)/',
        // Exemptions:
        //  - testing/$1 is always allowed (testing is the shared util)
        //  - shared/mailer may import shared/crypto: typed EncryptedBlob crosses
        //    the boundary so per-tenant SMTP passwords can be encrypted at the
        //    transport-config boundary. shared/crypto stays a pure leaf.
        //  - shared/config is pure toolchain (tsconfig, eslint rules, vitest
        //    knobs); every package may import it.
        pathNot: '^packages/shared-(testing|$1)/|^packages/shared-crypto/|^packages/shared-config/',
      },
    },
    {
      name: 'apps-cli-no-dispatcher',
      severity: 'error',
      comment: 'apps/cli is short-lived; never start the dispatcher there.',
      from: { path: '^apps/cli/' },
      to: { path: '^packages/core/src/dispatcher/' },
    },
    {
      name: 'no-orphan-modules',
      severity: 'warn',
      comment: 'Surfaces packages with no callers; useful while the tree is mostly placeholders.',
      from: {
        orphan: true,
        pathNot:
          '(^|/)(\\.|index\\.ts|.+\\.config\\.[cm]?[jt]s)$|^packages/shared-config/eslint/|(^|/)(__tests__|test)/|\\.(spec|test)\\.[jt]sx?$|/\\.storybook/|\\.stories\\.[jt]sx?$|(^|/)e2e/|^apps/web/src/lib/|(^|/)scripts/',
      },
      to: {},
    },
    {
      name: 'identity-auth-import-restricted',
      comment: 'Only @seta/core may import @seta/identity/auth (better-auth instance).',
      severity: 'error',
      from: { path: '^packages/(?!core/|identity/)' },
      to: { path: 'packages/identity/src/backend/auth\\.ts$' },
    },
    {
      name: 'identity-internals-blocked',
      comment: 'Peer modules must use @seta/identity public surface, never src/backend or src/db.',
      severity: 'error',
      from: { path: '^packages/(planner|copilot|integrations)/src/' },
      to: { path: '^packages/identity/src/(backend|db)/' },
    },
    {
      name: 'identity-sso-internals-blocked',
      comment:
        'SSO/Graph helpers under packages/identity/src/sso/ and /backend/sso/ are internal — outside callers must use the public surface.',
      severity: 'error',
      from: { path: '^packages/(?!identity/)' },
      to: { path: '^packages/identity/src/(sso|backend/sso)/' },
    },
    {
      name: 'copilot-sdk-no-mastra-runtime',
      severity: 'error',
      comment:
        '@seta/copilot-sdk is a pure contract package. It may import Mastra types (the @mastra/core module entry) but must not import deeper runtime modules.',
      from: { path: '^sdks/copilot/' },
      to: { path: '^node_modules/@mastra/(?!core/?$)' },
    },
    {
      name: 'shared-ui-no-dnd',
      comment:
        'Style monopoly: shared-ui composites must not depend on @hello-pangea/dnd; the app layer wires DnD via render slots.',
      severity: 'error',
      from: { path: '^packages/shared-ui/src/' },
      to: { path: '^node_modules/@hello-pangea/dnd' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|build|\\.turbo)(/|$)' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    includeOnly: '^(packages|apps|sdks)/',
  },
};
