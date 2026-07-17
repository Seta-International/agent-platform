import { index, layout, physical, rootRoute, route } from '@tanstack/virtual-file-routes';

export const routes = rootRoute('routes/__root.tsx', [
  route('/login', 'routes/login.tsx'),
  route('/403', 'routes/403.tsx'),
  layout('_authed', 'routes/_authed/route.tsx', [
    index('routes/_authed/index.tsx'),
    route('/settings', 'routes/_authed/settings/index.tsx'),
    route('/settings/profile', 'routes/_authed/settings/profile.tsx'),
    route('/settings/roles', 'routes/_authed/settings/roles.tsx'),
    route('/settings/skills', 'routes/_authed/settings/skills.tsx'),
    route('/settings/availability', 'routes/_authed/settings/availability.tsx'),
    route('/settings/security', 'routes/_authed/settings/security.tsx'),
    route('/settings/notifications', 'routes/_authed/settings/notifications.tsx'),
    physical('/planner', '../../../packages/web-planner/src/routes'),
    physical('/agent', '../../../packages/web-agent/src/routes'),
    physical('/admin', '../../../packages/web-admin/src/routes'),
    physical('/people', '../../../packages/web-people/src/routes'),
    physical('/hiring', '../../../packages/web-hiring/src/routes'),
    physical('/pm', '../../../packages/web-pm/src/routes'),
    // MODULE_ROUTE_MOUNTS_END — generator inserts new physical() app mounts above this comment.
  ]),
]);
