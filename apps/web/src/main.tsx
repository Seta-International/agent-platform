import '@seta/shared-ui/styles/tokens.css';
import '@seta/shared-ui/styles/fonts.css';
import './styles/globals.css';

import { ThemeProvider, Toaster } from '@seta/shared-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createAppRouter } from './router';
import { ErrorBoundary } from './shell/errors/error-boundary';

const queryClient = new QueryClient();
const router = createAppRouter(queryClient);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

if (typeof window !== 'undefined') {
  void import('./modules/planner/observability/web-vitals').then(
    ({ installWebVitals, defaultSend }) => {
      installWebVitals(defaultSend);
    },
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="seta-theme">
        <ErrorBoundary>
          <RouterProvider router={router} />
        </ErrorBoundary>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
