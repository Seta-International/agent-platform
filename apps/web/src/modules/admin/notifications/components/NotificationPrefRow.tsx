import { Badge, Switch } from '@seta/shared-ui';
import type { NotificationPrefRowDTO, PatchPrefInput } from '../../../notifications/api/client.ts';

export interface NotificationPrefRowProps {
  row: NotificationPrefRowDTO;
  onToggle: (input: PatchPrefInput) => void;
  disabled?: boolean;
}

export function NotificationPrefRow({ row, onToggle, disabled }: NotificationPrefRowProps) {
  const inAppId = `notif-${row.event_type}-in-app`;
  const emailId = `notif-${row.event_type}-email`;
  const anyOn = row.in_app_enabled || (row.email_enabled && row.email_available);

  return (
    <div className="flex items-start justify-between gap-6 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-body font-medium text-ink">{row.label}</span>
          <Badge variant={anyOn ? 'success' : 'secondary'}>{anyOn ? 'On' : 'Off'}</Badge>
        </div>
        <p className="m-0 mt-1 font-mono text-caption text-ink-subtle">{row.event_type}</p>
      </div>

      <div className="flex shrink-0 items-start gap-6">
        <ChannelToggle
          id={inAppId}
          label="In-app"
          checked={row.in_app_enabled}
          disabled={disabled}
          onCheckedChange={(enabled) =>
            onToggle({ event_type: row.event_type, channel: 'in_app', enabled })
          }
        />
        <ChannelToggle
          id={emailId}
          label="Email"
          checked={row.email_enabled}
          disabled={disabled || !row.email_available}
          onCheckedChange={(enabled) =>
            onToggle({ event_type: row.event_type, channel: 'email', enabled })
          }
        />
      </div>
    </div>
  );
}

interface ChannelToggleProps {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
}

function ChannelToggle({ id, label, checked, disabled, onCheckedChange }: ChannelToggleProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <label htmlFor={id} className="text-caption font-medium text-ink-muted">
        {label}
      </label>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={`Toggle ${label.toLowerCase()} notifications`}
      />
    </div>
  );
}
