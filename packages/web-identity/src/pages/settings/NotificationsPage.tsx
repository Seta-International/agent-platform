import { ComingSoonCard, SettingsSurface } from './settings-surface.tsx';

export function NotificationsPage() {
  return (
    <SettingsSurface title="Notifications">
      <ComingSoonCard body="Pick how and when you hear from us. Coming soon." />
    </SettingsSurface>
  );
}
