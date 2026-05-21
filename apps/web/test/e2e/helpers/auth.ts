import type { APIRequestContext } from '@playwright/test';

export const ADMIN_EMAIL = 'alice@acme-corp.example';
export const ADMIN_PASSWORD = 'Changeme1!alice';

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function signInAsAdmin(request: APIRequestContext): Promise<void> {
  // Vite (5173) usually starts before apps/server (tsx watch on 3000) is ready,
  // so the proxy returns 502/ECONNREFUSED for the first few seconds.
  const deadline = Date.now() + 60_000;
  let lastErr = '';
  while (Date.now() < deadline) {
    try {
      const res = await request.post('/api/identity/v1/auth/sign-in/email', {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      if (res.ok()) return;
      lastErr = `${res.status()} ${await res.text()}`;
      if (res.status() < 500) {
        throw new Error(`sign-in failed: ${lastErr}`);
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await sleep(1000);
  }
  throw new Error(`sign-in failed after 60s: ${lastErr}`);
}
