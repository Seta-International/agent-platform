import {
  Card,
  PageChrome,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@seta/shared-ui';
import { useEffect, useState } from 'react';
import { fetchProfile, type ProfileDto, patchProfile } from '../api/client.ts';
import { ProfileAvailabilitySection } from '../components/ProfileAvailabilitySection.tsx';
import { ProfileSkillsSection } from '../components/ProfileSkillsSection.tsx';
import { ProfileIdentityCard } from '../components/profile/ProfileIdentityCard.tsx';
import { ProfileRolesCard } from '../components/profile/ProfileRolesCard.tsx';
import { useSession } from '../components/SessionProvider.tsx';

function ComingSoonCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-8 text-center">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-sm text-ink-subtle">{body}</p>
    </Card>
  );
}

export function ProfileSettings() {
  const session = useSession();
  const [profile, setProfile] = useState<ProfileDto | null>(null);

  useEffect(() => {
    fetchProfile().then(setProfile);
  }, []);

  return (
    <Tabs defaultValue="profile" className="flex min-h-0 flex-1 flex-col">
      <PageChrome
        breadcrumb={['Settings']}
        title="Profile"
        toolbar={
          <TabsList className="border-b-0">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>
        }
      >
        <div className="bg-surface-1 min-h-full">
          <div className="page-container space-y-5">
            {!profile ? (
              <>
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-40 w-full" />
              </>
            ) : (
              <>
                <TabsContent value="profile" className="mt-0 flex flex-col gap-5">
                  <ProfileIdentityCard
                    profile={profile}
                    onSave={patchProfile}
                    onUpdate={setProfile}
                    canEditWorkingHours={false}
                  />
                  <ProfileRolesCard roles={session.role_summary.roles} />
                </TabsContent>

                <TabsContent value="skills" className="mt-0">
                  <ProfileSkillsSection
                    profile={profile}
                    onSave={patchProfile}
                    onUpdate={setProfile}
                  />
                </TabsContent>

                <TabsContent value="availability" className="mt-0">
                  <ProfileAvailabilitySection
                    profile={profile}
                    onSave={patchProfile}
                    onUpdate={setProfile}
                  />
                </TabsContent>

                <TabsContent value="security" className="mt-0">
                  <ComingSoonCard
                    title="Security"
                    body="Password changes and session controls are coming soon. For now, ask your admin to reset your password."
                  />
                </TabsContent>

                <TabsContent value="notifications" className="mt-0">
                  <ComingSoonCard
                    title="Notifications"
                    body="Pick how and when you hear from us. Coming soon."
                  />
                </TabsContent>
              </>
            )}
          </div>
        </div>
      </PageChrome>
    </Tabs>
  );
}
