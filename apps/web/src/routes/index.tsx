import { createFileRoute, redirect } from '@tanstack/react-router';
import { fetchMe } from '@/modules/identity/api/client.ts';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await fetchMe();
    throw redirect({ to: session ? '/authed' : '/login', search: {} });
  },
});
