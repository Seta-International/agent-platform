import { createFileRoute } from '@tanstack/react-router';
import { MoralePage } from '../../pages/morale-page.tsx';

export const Route = createFileRoute('/_authed/people/morale/')({
  component: MoralePage,
});
