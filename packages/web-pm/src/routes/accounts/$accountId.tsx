import { createFileRoute } from '@tanstack/react-router';
import { AccountDetailPage } from '../../pages/account-detail-page.tsx';

function RouteComponent(): JSX.Element {
  const { accountId } = Route.useParams();
  return <AccountDetailPage accountId={accountId} />;
}

export const Route = createFileRoute('/_authed/pm/accounts/$accountId')({
  component: RouteComponent,
});
