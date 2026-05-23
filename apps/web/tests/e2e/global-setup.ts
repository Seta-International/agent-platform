import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type FullConfig, request } from '@playwright/test';
import { signInAsAdmin } from './helpers/auth.ts';

export const ADMIN_STORAGE_STATE = '.auth/admin.json';

export default async function globalSetup(config: FullConfig): Promise<void> {
  const projectBaseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:5173';
  const ctx = await request.newContext({ baseURL: projectBaseURL });
  await signInAsAdmin(ctx);
  await mkdir(dirname(ADMIN_STORAGE_STATE), { recursive: true });
  await ctx.storageState({ path: ADMIN_STORAGE_STATE });
  await ctx.dispose();
}
