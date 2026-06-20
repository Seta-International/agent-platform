import { createFileRoute } from '@tanstack/react-router';
import { PmPage } from '../pages/pm-page.tsx';

export const Route = createFileRoute('/_authed/pm/')({
  component: PmPage,
});
