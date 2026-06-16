/* eslint-disable react-refresh/only-export-components -- this file co-locates two components and a hook for cohesion; splitting them would just create churn */
import { TabsContent, TabsList, TabsTrigger } from '@seta/shared-ui';
import { useState } from 'react';
import type { AdminUserDetail } from '../../api/users-client.ts';
import { ActivityTab } from './ActivityTab.tsx';
import { ProfileTab } from './ProfileTab.tsx';
import { ProjectsAllocationTab } from './ProjectsAllocationTab.tsx';
import { RolesTab } from './RolesTab.tsx';
import { SessionsTab } from './SessionsTab.tsx';

export function UserDetailTabsList({
  activityCount,
  sessionsCount,
}: {
  activityCount: number | null;
  sessionsCount: number | null;
}) {
  return (
    <TabsList className="border-b-0">
      <TabsTrigger value="projects">Projects &amp; allocation</TabsTrigger>
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
      <TabsTrigger value="audit">Audit</TabsTrigger>
    </TabsList>
  );
}

export function UserDetailTabsContent({
  detail,
  userId,
  onChange,
  setActivityCount,
  setSessionsCount,
}: {
  detail: AdminUserDetail;
  userId: string;
  onChange: () => void;
  setActivityCount: (n: number | null) => void;
  setSessionsCount: (n: number | null) => void;
}) {
  return (
    <>
      <TabsContent value="projects" className="mt-0">
        <ProjectsAllocationTab />
      </TabsContent>
      <TabsContent value="roles" className="mt-0">
        <RolesTab detail={detail} userId={userId} onChange={onChange} />
      </TabsContent>
      <TabsContent value="profile" className="mt-0">
        <ProfileTab detail={detail} userId={userId} onChange={onChange} />
      </TabsContent>
      <TabsContent value="activity" className="mt-0">
        <ActivityTab userId={userId} onCount={setActivityCount} />
      </TabsContent>
      <TabsContent value="sessions" className="mt-0">
        <SessionsTab userId={userId} onCount={setSessionsCount} />
      </TabsContent>
      <TabsContent value="audit" className="mt-0">
        <ActivityTab userId={userId} onCount={() => undefined} />
      </TabsContent>
    </>
  );
}

export function useUserDetailTabsCounts() {
  const [activityCount, setActivityCount] = useState<number | null>(null);
  const [sessionsCount, setSessionsCount] = useState<number | null>(null);
  return { activityCount, sessionsCount, setActivityCount, setSessionsCount };
}
