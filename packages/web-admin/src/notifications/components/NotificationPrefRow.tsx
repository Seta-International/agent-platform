import { Badge, Switch } from '@seta/shared-ui';
import type { NotificationPrefRowDTO, PatchPrefInput } from '@seta/web-notifications';

export interface NotificationPrefRowProps {
  row: NotificationPrefRowDTO;
  onToggle: (input: PatchPrefInput) => void;
  disabled?: boolean;
}

export function NotificationPrefRow({ row, onToggle, disabled }: NotificationPrefRowProps) {
  const anyOn = row.in_app_enabled || (row.email_enabled && row.email_available);

  return (
    <div className="flex items-start justify-between gap-6 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-body font-medium text-primary">{row.label}</span>
          <Badge variant={anyOn ? 'success' : 'neutral'} label={anyOn ? 'On' : 'Off'} />
        </div>
        <p className="m-0 mt-1 font-mono text-caption text-secondary">{row.event_type}</p>
      </div>

      <div className="flex shrink-0 items-start gap-6">
        <ChannelToggle
          label="In-app"
          checked={row.in_app_enabled}
          disabled={disabled}
          onCheckedChange={(enabled) =>
            onToggle({ event_type: row.event_type, channel: 'in_app', enabled })
          }
        />
        <ChannelToggle
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
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
}

function ChannelToggle({ label, checked, disabled, onCheckedChange }: ChannelToggleProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-caption font-medium text-secondary">{label}</span>
      <Switch
        label={`Toggle ${label.toLowerCase()} notifications`}
        isLabelHidden
        value={checked}
        isDisabled={disabled}
        onChange={onCheckedChange}
      />
    </div>
  );
}
