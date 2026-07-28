import { createFileRoute } from '@tanstack/react-router';
import { AllocationPage, type AllocationSearch } from '../pages/allocation-page.tsx';

export const Route = createFileRoute('/_authed/people/allocation')({
  validateSearch: (s: Record<string, unknown>): AllocationSearch => ({
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    status: s.status === 'over' || s.status === 'under' ? s.status : undefined,
    account: typeof s.account === 'string' && s.account ? s.account : undefined,
    project: typeof s.project === 'string' && s.project ? s.project : undefined,
    bucket:
      s.bucket === 'billable' || s.bucket === 'internal' || s.bucket === 'bench'
        ? s.bucket
        : undefined,
    crossProject:
      s.crossProject === true || s.crossProject === '1' || s.crossProject === 'true'
        ? true
        : undefined,
  }),
  component: AllocationPage,
});
