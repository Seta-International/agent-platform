import { markAsTemplate, startPgContainer } from '@seta/shared-testing';

let handle: Awaited<ReturnType<typeof startPgContainer>> | null = null;

export default async function (): Promise<() => Promise<void>> {
  handle = await startPgContainer();
  await markAsTemplate(handle, 'seta_template');
  process.env.SETA_TEST_PG_BASE = handle.baseUrl;
  process.env.SETA_TEST_PG_TEMPLATE = 'seta_template';
  return async () => {
    await handle?.stop();
  };
}
