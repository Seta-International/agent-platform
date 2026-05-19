import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { NotFound } from './shell/errors/not-found';
import { ServerError } from './shell/errors/server-error';

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultNotFoundComponent: NotFound,
  defaultErrorComponent: ({ error, reset }) => <ServerError error={error} onReset={reset} />,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
