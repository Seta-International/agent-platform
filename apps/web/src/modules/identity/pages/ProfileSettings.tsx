import { Skeleton } from '@seta/shared-ui';
import { useEffect, useState } from 'react';
import { fetchProfile, type ProfileDto } from '../api/client.ts';
import { ProfileAccountSection } from '../components/ProfileAccountSection.tsx';
import { ProfileAvailabilitySection } from '../components/ProfileAvailabilitySection.tsx';
import { ProfileLocaleSection } from '../components/ProfileLocaleSection.tsx';
import { ProfileSkillsSection } from '../components/ProfileSkillsSection.tsx';

export function ProfileSettings() {
  const [profile, setProfile] = useState<ProfileDto | null>(null);

  useEffect(() => {
    fetchProfile().then(setProfile);
  }, []);

  if (!profile) {
    return (
      <div className="space-y-4 max-w-2xl">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Profile &amp; settings</h1>
      <ProfileAccountSection profile={profile} onUpdate={setProfile} />
      <ProfileAvailabilitySection profile={profile} onUpdate={setProfile} />
      <ProfileSkillsSection profile={profile} onUpdate={setProfile} />
      <ProfileLocaleSection profile={profile} onUpdate={setProfile} />
    </div>
  );
}
