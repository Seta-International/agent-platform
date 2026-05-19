import '@seta/shared-ui/styles/tokens.css';
import '@seta/shared-ui/styles/fonts.css';
import './styles/globals.css';

import { ThemeProvider, Toaster } from '@seta/shared-ui';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { router } from './router';
import { ErrorBoundary } from './shell/errors/error-boundary';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="seta-theme">
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
      <Toaster />
    </ThemeProvider>
  </StrictMode>,
);
