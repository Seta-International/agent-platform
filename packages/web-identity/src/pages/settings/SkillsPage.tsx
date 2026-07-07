import { Skeleton } from '@seta/shared-ui';
import { patchProfile } from '../../api/client.ts';
import { ProfileSkillsSection } from '../../components/ProfileSkillsSection.tsx';
import { SettingsSurface } from './settings-surface.tsx';
import { useProfile } from './use-profile.ts';

export function SkillsPage() {
  const { profile, setProfile } = useProfile();
  return (
    <SettingsSurface title="Skills">
      {!profile ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <ProfileSkillsSection profile={profile} onSave={patchProfile} onUpdate={setProfile} />
      )}
    </SettingsSurface>
  );
}
