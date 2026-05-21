// Option A: throttle applied as Graph SDK middleware so every Graph call is rate-limited
// without touching individual job files.

import type { Context, Middleware } from '@microsoft/microsoft-graph-client';
import { Client, MiddlewareFactory } from '@microsoft/microsoft-graph-client';
import { buildAuthProvider, type M365Creds } from './auth.ts';
import { acquireToken } from './token-bucket.ts';

class ThrottleMiddleware implements Middleware {
  private next: Middleware | undefined;

  constructor(private readonly key: string) {}

  setNext(next: Middleware): void {
    this.next = next;
  }

  async execute(context: Context): Promise<void> {
    await acquireToken(this.key);
    if (this.next) await this.next.execute(context);
  }
}

export function buildGraphClient(creds: M365Creds, setaTenantId: string): Client {
  const authProvider = buildAuthProvider(creds);
  const defaultChain = MiddlewareFactory.getDefaultMiddlewareChain(authProvider);
  return Client.initWithMiddleware({
    middleware: [new ThrottleMiddleware(setaTenantId), ...defaultChain],
    defaultVersion: 'v1.0',
  });
}
