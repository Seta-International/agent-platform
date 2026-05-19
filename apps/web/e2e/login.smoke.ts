// requires apps/server reachable + demo tenant seeded
import { strict as assert } from 'node:assert';

const baseUrl = process.env.SETA_SERVER_URL ?? 'http://localhost:3000';
const email = process.env.SETA_ADMIN_EMAIL ?? 'admin@demo.local';
const password = process.env.SETA_ADMIN_PASSWORD ?? 'demo-admin-password-1';

async function main() {
  const signIn = await fetch(`${baseUrl}/api/identity/v1/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(signIn.status, 200, `sign-in failed: ${signIn.status}`);
  const cookie = signIn.headers.get('set-cookie');
  assert.ok(cookie?.includes('seta'), 'expected seta cookie');

  const me = await fetch(`${baseUrl}/api/identity/v1/me`, {
    headers: { cookie: cookie ?? '' },
  });
  assert.equal(me.status, 200, `/me failed: ${me.status}`);
  const meBody = await me.json();
  assert.equal(meBody.email, email);
  assert.ok(meBody.role_summary.roles.includes('org.admin'));

  console.log('login smoke OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
