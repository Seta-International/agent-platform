import { ComingSoonCard, SettingsSurface } from './settings-surface.tsx';

export function SecurityPage() {
  return (
    <SettingsSurface title="Security">
      <ComingSoonCard body="Password changes and session controls are coming soon. For now, ask your admin to reset your password." />
    </SettingsSurface>
  );
}
