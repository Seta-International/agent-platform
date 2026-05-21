import { Client } from '@microsoft/microsoft-graph-client';
import { buildAuthProvider, type M365Creds } from './auth.ts';

export function buildGraphClient(creds: M365Creds): Client {
  const authProvider = buildAuthProvider(creds);
  return Client.initWithMiddleware({
    authProvider,
    defaultVersion: 'v1.0',
    // RetryHandler is included in the default middleware chain; it honors Retry-After.
  });
}
