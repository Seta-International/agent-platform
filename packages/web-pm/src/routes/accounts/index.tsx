import { createFileRoute } from '@tanstack/react-router';
import { AccountsPage } from '../../pages/accounts-page.tsx';

export const Route = createFileRoute('/_authed/pm/accounts/')({
  component: AccountsPage,
});
