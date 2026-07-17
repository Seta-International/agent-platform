import { Skeleton } from '@seta/shared-ui';
import { patchProfile } from '../../api/client.ts';
import { ProfileAvailabilitySection } from '../../components/ProfileAvailabilitySection.tsx';
import { SettingsSurface } from './settings-surface.tsx';
import { useProfile } from './use-profile.ts';

export function AvailabilityPage() {
  const { profile, setProfile } = useProfile();
  return (
    <SettingsSurface title="Availability">
      {!profile ? (
        <Skeleton height={256} />
      ) : (
        <ProfileAvailabilitySection profile={profile} onSave={patchProfile} onUpdate={setProfile} />
      )}
    </SettingsSurface>
  );
}
