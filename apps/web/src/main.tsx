import './styles/globals.css';

import { ConfirmProvider, ThemeProvider } from '@seta/shared-ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { queryClient, router } from './router-instance';
import { ErrorBoundary } from './shell/errors/error-boundary';
import { ToastViewportWrapper } from './shell/toast-viewport-wrapper';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

if (typeof window !== 'undefined') {
  void import('@seta/web-planner').then(({ installWebVitals, defaultSend }) => {
    installWebVitals(defaultSend);
  });
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="seta-theme">
        <ToastViewportWrapper>
          <ConfirmProvider>
            <ErrorBoundary>
              <RouterProvider router={router} />
            </ErrorBoundary>
          </ConfirmProvider>
        </ToastViewportWrapper>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
