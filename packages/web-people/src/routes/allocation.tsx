import { createFileRoute } from '@tanstack/react-router';
import { AllocationPage } from '../pages/allocation-page.tsx';

export const Route = createFileRoute('/_authed/people/allocation')({
  component: AllocationPage,
});
