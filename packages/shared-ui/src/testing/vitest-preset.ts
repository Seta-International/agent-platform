import stylex from '@stylexjs/unplugin';

/**
 * `@seta/shared-ui` maps its `"."` export to `./src/index.ts` (source, not a built
 * dist), so every consumer compiles shared-ui's composites inside its own vitest.
 * Those composites call `stylex.create` at module scope, which throws at runtime
 * unless a bundler-side compiler rewrites it. Consumers must therefore run the
 * StyleX vite plugin too — importing it from here keeps `@stylexjs/unplugin`
 * resolving inside shared-ui's own module graph, so no consumer has to declare it.
 */
export function stylexVitePlugin() {
  return stylex.vite({
    dev: true,
    runtimeInjection: false,
  });
}
