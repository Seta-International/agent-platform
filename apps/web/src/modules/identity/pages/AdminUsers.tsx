import { useState } from 'react';
import { AdminUsersTable } from '../components/AdminUsersTable.tsx';
import { CreateUserDialog } from '../components/CreateUserDialog.tsx';
import { UserDetailDrawer } from '../components/UserDetailDrawer.tsx';

export function AdminUsers() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <CreateUserDialog onCreated={bump} />
      </div>
      <AdminUsersTable refreshKey={refreshKey} onRowClick={setOpenUserId} />
      <UserDetailDrawer userId={openUserId} onClose={() => setOpenUserId(null)} onChange={bump} />
    </div>
  );
}
