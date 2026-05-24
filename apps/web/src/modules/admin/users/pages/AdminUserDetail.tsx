import { Alert, AlertDescription, Tabs } from '@seta/shared-ui';
import { useEffect, useState } from 'react';
import { type AdminUserDetail as Detail, getAdminUserDetail } from '../api/users-client.ts';
import { AllocationRailCard } from '../components/user-detail/AllocationRailCard.tsx';
import { IdentityRailCard } from '../components/user-detail/IdentityRailCard.tsx';
import { SkillsRailCard } from '../components/user-detail/SkillsRailCard.tsx';
import { UserDetailHeader } from '../components/user-detail/UserDetailHeader.tsx';
import {
  UserDetailTabsContent,
  UserDetailTabsList,
  useUserDetailTabsCounts,
} from '../components/user-detail/UserDetailTabs.tsx';

export function AdminUserDetail({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { activityCount, sessionsCount, setActivityCount, setSessionsCount } =
    useUserDetailTabsCounts();

  async function refresh() {
    try {
      setDetail(await getAdminUserDetail(userId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getAdminUserDetail(userId);
        if (!cancelled) {
          setDetail(d);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (error) {
    return (
      <div className="px-7 py-6">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!detail) return <div className="text-sm text-ink-muted p-6">Loading…</div>;

  return (
    <Tabs defaultValue="projects" className="flex flex-col min-h-0">
      <UserDetailHeader detail={detail} userId={userId} onChange={() => void refresh()} />
      <div className="px-7 border-b border-hairline bg-canvas">
        <UserDetailTabsList activityCount={activityCount} sessionsCount={sessionsCount} />
      </div>

      <div className="bg-surface-1 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1180px] grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-7 px-7 py-7 items-start">
          <main className="min-w-0">
            <UserDetailTabsContent
              detail={detail}
              userId={userId}
              onChange={() => void refresh()}
              setActivityCount={setActivityCount}
              setSessionsCount={setSessionsCount}
            />
          </main>
          <aside className="flex flex-col gap-3.5 xl:sticky xl:top-7">
            <IdentityRailCard detail={detail} />
            <AllocationRailCard />
            <SkillsRailCard skills={detail.profile.skills} />
          </aside>
        </div>
      </div>
    </Tabs>
  );
}
