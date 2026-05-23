import { useState } from 'react';
import type { ProfileDto, SaveProfile } from '@/modules/identity/api/client.ts';
import { ProfileAccountSection } from '@/modules/identity/components/ProfileAccountSection.tsx';
import { ProfileAvailabilitySection } from '@/modules/identity/components/ProfileAvailabilitySection.tsx';
import { ProfileLocaleSection } from '@/modules/identity/components/ProfileLocaleSection.tsx';
import { ProfileSkillsSection } from '@/modules/identity/components/ProfileSkillsSection.tsx';
import { type AdminUserDetail, patchAdminUserProfile } from '../../api/users-client.ts';
import { ChangeEmailDialog } from '../ChangeEmailDialog.tsx';
import { EmailHistorySection } from '../EmailHistorySection.tsx';

export function ProfileTab({
  detail,
  userId,
  onChange,
}: {
  detail: AdminUserDetail;
  userId: string;
  onChange: () => void;
}) {
  const [profile, setProfile] = useState<ProfileDto>(detail.profile);

  const save: SaveProfile = (patch) => patchAdminUserProfile(userId, patch);

  function handleUpdate(p: ProfileDto) {
    setProfile(p);
    onChange();
  }

  return (
    <div className="space-y-5">
      <ProfileAccountSection
        profile={profile}
        onSave={save}
        onUpdate={handleUpdate}
        showEmail={false}
      />

      <div className="flex items-center gap-3 rounded-md border border-hairline p-4">
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider text-ink-muted">Email</div>
          <div className="font-mono text-sm mt-1 truncate" title={profile.email}>
            {profile.email}
          </div>
        </div>
        <ChangeEmailDialog
          userId={userId}
          currentEmail={profile.email}
          disabled={false}
          onChanged={onChange}
        />
      </div>

      <ProfileAvailabilitySection profile={profile} onSave={save} onUpdate={handleUpdate} />
      <ProfileSkillsSection profile={profile} onSave={save} onUpdate={handleUpdate} />
      <ProfileLocaleSection
        profile={profile}
        onSave={save}
        onUpdate={handleUpdate}
        canEditWorkingHours
      />
      <EmailHistorySection userId={userId} />
    </div>
  );
}
