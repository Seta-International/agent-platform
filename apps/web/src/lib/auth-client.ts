import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: '/api/identity/v1/auth',
});

export const { signIn, signOut } = authClient;
