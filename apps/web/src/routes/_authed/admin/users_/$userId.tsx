import { createFileRoute } from '@tanstack/react-router';
import { AdminUserDetail } from '@/modules/identity/pages/AdminUserDetail.tsx';

export const Route = createFileRoute('/_authed/admin/users_/$userId')({
  component: function UserDetailPage() {
    const { userId } = Route.useParams();
    return <AdminUserDetail userId={userId} />;
  },
});
