import { createFileRoute } from '@tanstack/react-router';
import { PeoplePage } from '../../pages/people-page.tsx';

export const Route = createFileRoute('/_authed/people/employees/')({
  component: PeoplePage,
});
