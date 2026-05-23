import { Switch } from '@seta/shared-ui';
import type { NotificationPrefRowDTO, PatchPrefInput } from '../../../notifications/api/client.ts';

export const EMAIL_DEFERRED_HINT =
  'Email delivery ships in v1.x — your selection will take effect then.';

export interface NotificationPrefRowProps {
  row: NotificationPrefRowDTO;
  onToggle: (input: PatchPrefInput) => void;
  disabled?: boolean;
}

export function NotificationPrefRow({ row, onToggle, disabled }: NotificationPrefRowProps) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-3 text-sm font-medium">{row.label}</td>
      <td className="px-4 py-3">
        <Switch
          checked={row.in_app_enabled}
          disabled={disabled}
          onCheckedChange={(enabled) =>
            onToggle({ event_type: row.event_type, channel: 'in_app', enabled })
          }
          aria-label={`Toggle in-app notifications for ${row.label}`}
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={row.email_enabled}
            disabled={disabled}
            onCheckedChange={(enabled) =>
              onToggle({ event_type: row.event_type, channel: 'email', enabled })
            }
            aria-label={`Toggle email notifications for ${row.label}`}
            title={row.email_available ? undefined : EMAIL_DEFERRED_HINT}
          />
          {!row.email_available && (
            <span
              className="rounded bg-surface-3 px-1.5 py-0.5 font-medium text-muted-foreground text-xs"
              title={EMAIL_DEFERRED_HINT}
            >
              v1.x
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
