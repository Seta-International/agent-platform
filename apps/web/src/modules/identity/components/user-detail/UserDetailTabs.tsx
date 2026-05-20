import { Tabs, TabsContent, TabsList, TabsTrigger } from '@seta/shared-ui';
import { useState } from 'react';
import type { AdminUserDetail } from '../../api/client.ts';
import { ActivityTab } from './ActivityTab.tsx';
import { ProfileTab } from './ProfileTab.tsx';
import { RolesTab } from './RolesTab.tsx';
import { SessionsTab } from './SessionsTab.tsx';

export function UserDetailTabs({
  detail,
  userId,
  onChange,
}: {
  detail: AdminUserDetail;
  userId: string;
  onChange: () => void;
}) {
  const [activityCount, setActivityCount] = useState<number | null>(null);
  const [sessionsCount, setSessionsCount] = useState<number | null>(null);

  return (
    <Tabs defaultValue="roles" className="w-full">
      <TabsList>
        <TabsTrigger value="roles">Roles</TabsTrigger>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="activity">
          Activity
          {activityCount != null && (
            <span className="ml-1 text-xs text-ink-muted">{activityCount}</span>
          )}
        </TabsTrigger>
        <TabsTrigger value="sessions">
          Sessions
          {sessionsCount != null && (
            <span className="ml-1 text-xs text-ink-muted">{sessionsCount}</span>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="roles">
        <RolesTab detail={detail} userId={userId} onChange={onChange} />
      </TabsContent>
      <TabsContent value="profile">
        <ProfileTab detail={detail} userId={userId} onChange={onChange} />
      </TabsContent>
      <TabsContent value="activity">
        <ActivityTab userId={userId} onCount={setActivityCount} />
      </TabsContent>
      <TabsContent value="sessions">
        <SessionsTab userId={userId} onCount={setSessionsCount} />
      </TabsContent>
    </Tabs>
  );
}
