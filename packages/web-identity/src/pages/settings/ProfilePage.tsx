import { Skeleton } from '@seta/shared-ui';
import { patchProfile } from '../../api/client.ts';
import { ProfileIdentityCard } from '../../components/profile/ProfileIdentityCard.tsx';
import { SettingsSurface } from './settings-surface.tsx';
import { useProfile } from './use-profile.ts';

export function ProfilePage() {
  const { profile, setProfile } = useProfile();
  return (
    <SettingsSurface title="Profile">
      {!profile ? (
        <>
          <Skeleton height={256} />
          <Skeleton height={160} />
        </>
      ) : (
        <ProfileIdentityCard
          profile={profile}
          onSave={patchProfile}
          onUpdate={setProfile}
          canEditWorkingHours={false}
        />
      )}
    </SettingsSurface>
  );
}
