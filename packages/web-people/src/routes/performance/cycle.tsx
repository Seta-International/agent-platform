import { createFileRoute } from '@tanstack/react-router';
import { CycleUnlockPage } from '../../pages/cycle-unlock-page.tsx';

export const Route = createFileRoute('/_authed/people/performance/cycle')({
  component: CycleUnlockPage,
});
