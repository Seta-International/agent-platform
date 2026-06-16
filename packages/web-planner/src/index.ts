// Public surface for the planner app package. Consumers outside this package — the
// suite shell, the _authed guard layout, main.tsx bootstrap, and the identity grant
// dialog — import only what's re-exported here. Internal hooks, queries, and mutations
// stay internal by design (boundary discipline).
export { plannerClient } from './api/planner-client.ts';
export { plannerAppManifest } from './manifest.ts';
export { useResolvePlannerNotification } from './notifications/renderers.tsx';
export { defaultSend, installWebVitals } from './observability/web-vitals.ts';
export { plannerKeys } from './state/query-keys.ts';
