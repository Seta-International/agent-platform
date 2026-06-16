import { physical, rootRoute } from '@tanstack/virtual-file-routes';

// Shell host composition root. App packages are added as physical() mounts in a later plan.
// Paths resolve relative to routesDirectory (./src). 'routes' => ./src/routes (the app's own tree).
export const routes = rootRoute('routes/__root.tsx', [physical('', 'routes')]);
