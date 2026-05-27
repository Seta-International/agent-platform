/** Dependency-cruiser config — module boundary gate.
 *
 * Adding a new feature module or shared package requires zero edits here:
 * path prefixes do the discrimination (`packages/shared-*` is infra, anything
 * else under `packages/` is module-or-SDK). The only literal-name allowlist
 * that remains is `apps/(server|worker|cli)` for the runtime-importer set.
 */
module.exports = {
  forbidden: [
    // 1. No circular imports — error, repo-wide.
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular imports tend to bite. Refactor to break the cycle.',
      from: {},
      to: { circular: true },
    },

    // 2. Test files don't bleed into production.
    {
      name: 'not-to-test',
      severity: 'error',
      comment: "Don't import test sources from production code.",
      from: { pathNot: '\\.(spec|test)\\.[jt]sx?$' },
      to: { path: '\\.(spec|test)\\.[jt]sx?$' },
    },

    // 3. Cross-module imports go through public surface only. A module's
    //    internals (src/backend, src/db) are private. The `pathNot` back-ref
    //    on `^packages/$1/` keeps a module's own files able to reach its own
    //    internals; everything else routes through the package root or
    //    declared subpaths (/events, /rbac, /contracts, /agent-tools).
    //    /agent-tools/register.ts is a public side-effect subpath exported by
    //    package.json; agent's init-registry imports it to trigger module
    //    registration before registry freeze.
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        "A feature module's internals (src/backend, src/db) are private. Cross-module imports must enter via the package root (src/index.ts) or a declared subpath (/events, /rbac, /contracts, /agent-tools).",
      from: { path: '^packages/(?!shared-)([^/]+)/src/' },
      to: {
        path: '^packages/(?!shared-)([^/]+)/src/(backend|db)/',
        pathNot: '^packages/$1/|/agent-tools/register\\.ts$',
      },
    },

    // 3.5. Modules must not import another module's agent tool functions directly.
    //      Cross-module tool access goes through AgentRegistry via @seta/agent-sdk.
    //      The /agent-tools/register.ts side-effect subpath and /agent-tools/index.ts
    //      collection re-export are permitted public surfaces.
    {
      name: 'no-direct-cross-module-tool-import',
      severity: 'error',
      comment:
        "Modules must not import another module's agent tool function directly. Cross-module tool access goes through AgentRegistry via @seta/agent-sdk.",
      from: { path: '^packages/(?!shared-)([^/]+)/src/' },
      to: {
        path: '^packages/(?!shared-)([^/]+)/src/backend/agent-tools/',
        pathNot: '^packages/$1/|/agent-tools/(register|index)\\.ts$',
      },
    },

    // 4. /backend is composed only by apps/server, apps/worker, apps/cli
    //    (ops/admin surface), plus the module itself. apps/(server|worker|cli)
    //    are exempt across their whole tree — src/ and tests/ both — so app
    //    integration tests can exercise module backends.
    {
      name: 'only-server-imports-backend',
      severity: 'error',
      comment:
        "A module's /backend subpath is private to apps/server, apps/worker, apps/cli (ops/admin tool), and the module itself.",
      from: {
        path: '^(?:packages|apps)/([^/]+)/',
        pathNot: '^apps/(server|worker|cli)/',
      },
      to: {
        path: '^packages/(?!shared-)([^/]+)/src/backend/',
        pathNot: '^packages/$1/|/agent-tools/register\\.ts$',
      },
    },

    // 5. Apps may not import each other.
    {
      name: 'no-app-to-app-imports',
      severity: 'error',
      comment: 'Apps must not import each other.',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/([^/]+)/', pathNot: '^apps/$1/' },
    },

    // 6. shared-* is pure infra and may not import feature modules.
    {
      name: 'shared-must-not-import-modules',
      severity: 'error',
      comment: 'shared/* may not import from feature modules. They are pure infrastructure.',
      from: { path: '^packages/shared-' },
      to: { path: '^packages/(?!shared-)([^/]+)/' },
    },

    // 7. shared-<a> may not import shared-<b>. Exemptions:
    //    - shared-testing (the shared util) is always allowed.
    //    - shared-mailer may import shared-crypto: typed EncryptedBlob crosses
    //      so per-tenant SMTP passwords stay encrypted at the transport config
    //      boundary. shared-crypto stays a pure leaf.
    //    - shared-config is pure toolchain (tsconfig, eslint rules, vitest
    //      knobs); every package may import it.
    {
      name: 'shared-cross-imports-restricted',
      severity: 'error',
      comment:
        'shared/<a> may not import from shared/<b>. shared/testing is the exception (it may import any shared/*; any shared/* may import shared/testing from test files).',
      from: {
        path: '^packages/shared-(?!testing)([^/]+)/',
        pathNot: '(^|/)(tests)/',
      },
      to: {
        path: '^packages/shared-([^/]+)/',
        pathNot: '^packages/shared-(testing|$1)/|^packages/shared-(crypto|config)/',
      },
    },

    // 8. Infra internals are private outside the owning shared package.
    {
      name: 'no-deep-shared-imports',
      severity: 'error',
      comment: 'Outside shared/<x>, never reach into its internals.',
      from: { pathNot: '^packages/shared-([^/]+)/' },
      to: { path: '^packages/shared-([^/]+)/src/internals/' },
    },

    // 9. SDKs are pure contract packages. They may import shared-* infra but
    //    must never import feature modules or apps.
    {
      name: 'sdks-no-module-imports',
      severity: 'error',
      comment:
        'SDKs are pure contract packages. They may import shared-* infra but must never import feature modules or apps.',
      from: { path: '^sdks/' },
      to: { path: '^(packages/(?!shared-)([^/]+)/|apps/)' },
    },

    // 10. agent-sdk imports Mastra TYPES only (the package entry); no deeper
    //     runtime modules.
    {
      name: 'agent-sdk-no-mastra-runtime',
      severity: 'error',
      comment:
        '@seta/agent-sdk is a pure contract package. It may import Mastra types (the @mastra/core module entry) but must not import deeper runtime modules.',
      from: { path: '^sdks/agent/' },
      to: { path: '^node_modules/@mastra/(?!core/?$)' },
    },

    // 11. agent is engine-only. It composes module-owned agent tools at
    //     session time via the contribution registry, never by direct import.
    //     The only feature-module cross-import allowed is the /events subpath
    //     (event-shape contracts), in file or directory form. `core` is
    //     foundation tier (every module imports it) and is excluded from the
    //     `to:` path; `shared-*` is infra.
    {
      name: 'agent-no-feature-imports',
      severity: 'error',
      comment:
        'agent is engine-only: it composes module-owned agent tools at session time via the registry, never by direct import. The only feature-module cross-import allowed is /events (event-shape contracts). @seta/core is foundation tier and may be imported freely.',
      from: { path: '^packages/agent/src/' },
      to: {
        path: '^packages/(?!shared-|agent/|core/)([^/]+)/',
        pathNot: '^packages/[^/]+/src/events(\\.ts$|/)|/agent-tools/register\\.ts$',
      },
    },

    // 12. Feature and orchestrator modules consume the agent SDK
    //     (@seta/agent-sdk), never @seta/agent internals. The only
    //     @seta/agent subpaths a module may import are ./rbac and ./events.
    //     Apps (apps/server, apps/cli) are exempt — `from:` matches only
    //     packages.
    {
      name: 'modules-no-agent-internals',
      severity: 'error',
      comment:
        'Feature and orchestrator modules consume the agent SDK (@seta/agent-sdk), never @seta/agent internals. The only @seta/agent subpaths a module may import are ./rbac and ./events.',
      from: { path: '^packages/(?!shared-|agent/)([^/]+)/src/' },
      to: {
        path: '^packages/agent/src/',
        pathNot: '^packages/agent/src/(rbac|events)(/|.ts$)',
      },
    },

    // 13. @seta/core/runtime (dispatcher + worker pool + bootstrap) is private
    //     to apps/server, apps/worker, and integration tests.
    {
      name: 'core-runtime-restricted',
      severity: 'error',
      comment:
        '@seta/core/runtime (dispatcher + worker pool + bootstrap) is private to apps/server, apps/worker, and feature-module integration tests. Other importers must use the main @seta/core surface.',
      from: {
        pathNot: '^(apps/(server|worker)/|packages/core/)|/tests/|\\.(test|spec)\\.[jt]sx?$',
      },
      to: { path: '^packages/core/src/runtime/' },
    },

    // 14. apps/cli is short-lived; never start the dispatcher there.
    {
      name: 'apps-cli-no-dispatcher',
      severity: 'error',
      comment: 'apps/cli is short-lived; never start the dispatcher there.',
      from: { path: '^apps/cli/' },
      to: { path: '^packages/core/src/runtime/dispatcher/' },
    },

    // 15. apps/web and any -web package are browser code: they must not import
    //     backend or db layers from any module.
    {
      name: 'web-no-backend-imports',
      severity: 'error',
      comment:
        'apps/web and any -web package are browser code: they must not import backend or db layers from any module.',
      from: { path: '^(apps/web/|packages/.+-web/)' },
      to: { path: '^packages/(?!shared-|.+-web/)([^/]+)/src/(backend|db)/' },
    },

    // 16. shared-ui composites must not depend on @hello-pangea/dnd; the app
    //     layer wires DnD via render slots.
    {
      name: 'shared-ui-no-dnd',
      severity: 'error',
      comment:
        'Style monopoly: shared-ui composites must not depend on @hello-pangea/dnd; the app layer wires DnD via render slots.',
      from: { path: '^packages/shared-ui/src/' },
      to: { path: '^node_modules/@hello-pangea/dnd' },
    },

    // 17. Test layout — no legacy folder names. Belt-and-braces with
    //     `pnpm lint:test-layout`.
    {
      name: 'no-legacy-test-folders',
      severity: 'error',
      comment:
        'Test files belong in <package>/tests/{unit,integration,contract}/. Legacy __tests__/ and test/ folders are not permitted (also enforced by pnpm lint:test-layout).',
      from: { path: '^(packages|apps|sdks)/[^/]+/.*/(__tests__|test)/' },
      to: {},
    },

    // 18. No test files inside src/. They live under <package>/tests/.
    {
      name: 'no-tests-inside-src',
      severity: 'error',
      comment:
        'Test files (*.test.ts, *.spec.ts) must not sit under src/. Move them under <package>/tests/{unit,integration,contract}/.',
      from: { path: '^(packages|apps|sdks)/[^/]+/src/.+\\.(test|spec)\\.[jt]sx?$' },
      to: {},
    },

    // Stays at `warn`: orphans during refactor are expected (factory output,
    // placeholder modules without callers yet). Additionally exempt
    // `setup-db-test.ts` — vitest configs reference it by URL path
    // (`fileURLToPath`), not by import, so depcruise sees no edge.
    {
      name: 'no-orphan-modules',
      severity: 'warn',
      comment: 'Surfaces packages with no callers; useful while the tree is mostly placeholders.',
      from: {
        orphan: true,
        pathNot:
          '(^|/)(\\.|index\\.ts|.+\\.config\\.[cm]?[jt]s)$|^packages/shared-config/(eslint|vitest)/|(^|/)(tests)/|\\.(spec|test)\\.[jt]sx?$|/\\.storybook/|\\.stories\\.[jt]sx?$|(^|/)e2e/|^apps/web/src/(lib|routes)/|(^|/)scripts/',
      },
      to: {},
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
