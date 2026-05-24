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
        "A feature module's internals (src/backend, src/db) are private. Cross-module imports must enter via the package root (src/index.ts), the /events subpath, or the /agent-tools subpath (which is a public surface for cross-module Mastra tool composition).",
      from: {
        path: '^packages/(core|identity|planner|copilot|integrations|knowledge|notifications|staffing)/src/',
      },
      to: {
        path: '^packages/(core|identity|planner|copilot|integrations|knowledge|notifications|staffing)/src/(backend|db)/',
        pathNot:
          '^packages/$1/src/|^packages/(core|identity|planner|staffing)/src/backend/agent-tools/|^packages/copilot/src/backend/(runtime\\.ts|workflows/_infra/input-schema-registry\\.ts)$',
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
        path: '^packages/(core|identity|planner|copilot|integrations|knowledge|notifications|staffing)/src/backend/',
        pathNot:
          '^packages/$1/|^packages/(core|identity|planner|staffing)/src/backend/agent-tools/',
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
      to: {
        path: '^packages/(core|identity|planner|copilot|integrations|knowledge|notifications|staffing)/',
      },
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
      to: { path: '^packages/core/src/runtime/dispatcher/' },
    },
    {
      name: 'core-runtime-restricted',
      severity: 'error',
      comment:
        '@seta/core/runtime (dispatcher + worker pool + bootstrap) is private to apps/server, apps/worker, and feature-module integration tests. Other importers must use the main @seta/core surface.',
      from: {
        pathNot:
          '^(apps/(server|worker)/|packages/core/)|/(__tests__|tests)/|\\.(test|spec)\\.[jt]sx?$',
      },
      to: { path: '^packages/core/src/runtime/' },
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
      comment:
        'Peer modules must use @seta/identity public surface (or the /agent-tools subpath), never src/backend or src/db.',
      severity: 'error',
      from: { path: '^packages/(planner|copilot|integrations)/src/' },
      to: {
        path: '^packages/identity/src/(backend|db)/',
        pathNot: '^packages/identity/src/backend/agent-tools/',
      },
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
      name: 'copilot-no-feature-imports',
      severity: 'error',
      comment:
        'copilot is engine-only: it composes module-owned agent tools but must not pull in feature-module or orchestrator domain code. Cross-module imports must enter through /events (event-shape contracts) or /agent-tools (tool surface) subpaths.',
      from: { path: '^packages/copilot/src/' },
      to: {
        path: '^packages/(identity|planner|integrations|knowledge|notifications|staffing)/',
        pathNot:
          '^packages/[^/]+/src/events/|^packages/[^/]+/src/backend/agent-tools/|^packages/[^/]+/src/agent-tools\\.ts$',
      },
    },
    {
      name: 'modules-no-copilot-direct',
      severity: 'error',
      comment:
        'Feature and orchestrator modules consume the agent SDK (@seta/copilot-sdk), never @seta/copilot internals. The allowed entry points are the public subpath target files: src/index.ts, src/events/, src/rbac.ts, src/models.ts, src/register.ts, src/backend/runtime.ts (./runtime), and src/backend/workflows/_infra/input-schema-registry.ts (./workflows).',
      from: {
        path: '^packages/(identity|planner|integrations|knowledge|notifications|staffing)/src/',
      },
      to: {
        path: '^packages/copilot/src/',
        pathNot:
          '^packages/copilot/src/(index\\.ts|events/|rbac\\.ts|models\\.ts|register\\.ts|backend/runtime\\.ts|backend/workflows/_infra/input-schema-registry\\.ts)',
      },
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
