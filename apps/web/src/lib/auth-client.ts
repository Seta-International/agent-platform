import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: `${window.location.origin}/api/identity/v1/auth`,
});

export const { signIn, signOut } = authClient;
