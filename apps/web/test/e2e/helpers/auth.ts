import type { APIRequestContext } from '@playwright/test';

export const ADMIN_EMAIL = 'alice@acme-corp.example';
export const ADMIN_PASSWORD = 'Changeme1!alice';

export async function signInAsAdmin(request: APIRequestContext): Promise<void> {
  const res = await request.post('/api/identity/v1/auth/sign-in/email', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`sign-in failed: ${res.status()} ${await res.text()}`);
  }
}
