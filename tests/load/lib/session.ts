import { check } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  BASE_URL,
  MEMBER_COUNT,
  MEMBER_DOMAIN,
  MEMBER_PASSWORD,
} from '../config.ts';

let loggedIn = false; // module state is per-VU in k6

export function login(email: string, password: string): void {
  const res = http.post(
    `${BASE_URL}/api/identity/v1/auth/sign-in/email`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { journey: 'auth' } },
  );
  check(res, { 'signed in': (r) => r.status === 200 });
  if (res.status !== 200) {
    exec.test.abort(`sign-in failed for ${email}: HTTP ${res.status}`);
  }
}

export function loginAsAdmin(): void {
  login(ADMIN_EMAIL, ADMIN_PASSWORD);
}

// Maps VU -> member user (member1..memberN@<domain>, round-robin) and signs in
// once per VU lifetime; the VU cookie jar keeps the session for all iterations.
export function loginAsMember(): void {
  if (loggedIn) return;
  const idx = ((exec.vu.idInTest - 1) % MEMBER_COUNT) + 1;
  login(`member${idx}@${MEMBER_DOMAIN}`, MEMBER_PASSWORD);
  loggedIn = true;
}
