import { Avatar, AvatarFallback, Card, Skeleton } from '@seta/shared-ui';
import { type ReactNode, useEffect, useState } from 'react';
import { fetchProfile, type ProfileDto, patchProfile } from '../api/client.ts';
import { ProfileAccountSection } from '../components/ProfileAccountSection.tsx';
import { ProfileAvailabilitySection } from '../components/ProfileAvailabilitySection.tsx';
import { ProfileLocaleSection } from '../components/ProfileLocaleSection.tsx';
import { ProfileSkillsSection } from '../components/ProfileSkillsSection.tsx';
import { StatusPill } from '../components/user-list/StatusPill.tsx';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function RailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-hairline last:border-b-0 text-sm">
      <span className="text-ink-muted text-xs uppercase tracking-wider">{label}</span>
      <span>{children}</span>
    </div>
  );
}

export function ProfileSettings() {
  const [profile, setProfile] = useState<ProfileDto | null>(null);

  useEffect(() => {
    fetchProfile().then(setProfile);
  }, []);

  if (!profile) {
    return (
      <div className="mx-auto max-w-[1180px] px-7 py-7 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-7">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const wh = profile.working_hours;

  return (
    <div className="flex flex-col min-h-0">
      <div className="border-b border-hairline px-7 py-4 bg-canvas">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 text-xl">
            <AvatarFallback>{initials(profile.display_name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-[22px] font-semibold tracking-tight">{profile.display_name}</h1>
              <StatusPill status={profile.availability_status} />
            </div>
            <div className="flex items-center gap-3 text-sm text-ink-muted min-w-0">
              <span className="font-mono truncate min-w-0 max-w-[40ch]" title={profile.email}>
                {profile.email}
              </span>
              <span className="opacity-60 flex-none">·</span>
              <span className="flex-none">{profile.timezone}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface-1 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1180px] grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-7 px-7 py-7 items-start">
          <main className="min-w-0 space-y-6">
            <ProfileAccountSection
              profile={profile}
              onSave={patchProfile}
              onUpdate={setProfile}
              passwordHint="Password change coming soon — contact your admin to reset for now."
            />
            <ProfileAvailabilitySection
              profile={profile}
              onSave={patchProfile}
              onUpdate={setProfile}
            />
            <ProfileSkillsSection profile={profile} onSave={patchProfile} onUpdate={setProfile} />
            <ProfileLocaleSection
              profile={profile}
              onSave={patchProfile}
              onUpdate={setProfile}
              canEditWorkingHours={false}
            />
          </main>

          <aside className="flex flex-col gap-3.5 xl:sticky xl:top-7">
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-ink-muted mb-2">
                At a glance
              </div>
              <RailRow label="Email">
                <span
                  className="font-mono text-sm truncate max-w-[200px] inline-block align-bottom"
                  title={profile.email}
                >
                  {profile.email}
                </span>
              </RailRow>
              <RailRow label="Timezone">{profile.timezone}</RailRow>
              <RailRow label="Hours">{wh ? `Mon–Fri ${wh.start}–${wh.end}` : '—'}</RailRow>
              <RailRow label="Status">{profile.availability_status}</RailRow>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
