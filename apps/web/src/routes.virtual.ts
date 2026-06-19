import { index, layout, physical, rootRoute, route } from '@tanstack/virtual-file-routes';

export const routes = rootRoute('routes/__root.tsx', [
  route('/login', 'routes/login.tsx'),
  route('/403', 'routes/403.tsx'),
  physical('/dev', 'routes/dev'),
  layout('_authed', 'routes/_authed/route.tsx', [
    index('routes/_authed/index.tsx'),
    route('/profile', 'routes/_authed/profile.tsx'),
    physical('/planner', '../../../packages/web-planner/src/routes'),
    physical('/agent', '../../../packages/web-agent/src/routes'),
    physical('/admin', '../../../packages/web-admin/src/routes'),
    physical('/people', '../../../packages/web-people/src/routes'),
    // MODULE_ROUTE_MOUNTS_END — generator inserts new physical() app mounts above this comment.
  ]),
]);
