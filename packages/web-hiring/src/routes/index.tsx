import { createFileRoute } from '@tanstack/react-router';
import { HiringPage } from '../pages/hiring-page.tsx';

export const Route = createFileRoute('/_authed/hiring/')({
  component: HiringPage,
});
