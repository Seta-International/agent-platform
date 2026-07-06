import { ProfileRolesCard } from '../../components/profile/ProfileRolesCard.tsx';
import { useSession } from '../../components/SessionProvider.tsx';
import { SettingsSurface } from './settings-surface.tsx';

export function RolesPage() {
  const session = useSession();
  return (
    <SettingsSurface title="Roles">
      <ProfileRolesCard roles={session.role_summary.roles} />
    </SettingsSurface>
  );
}
