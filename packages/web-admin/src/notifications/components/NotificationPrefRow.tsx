import { Badge, Divider, HStack, StackItem, Switch, Text, VStack } from '@seta/shared-ui';
import type { NotificationPrefRowDTO, PatchPrefInput } from '@seta/web-notifications';

export interface NotificationPrefRowProps {
  row: NotificationPrefRowDTO;
  onToggle: (input: PatchPrefInput) => void;
  disabled?: boolean;
}

export function NotificationPrefRow({ row, onToggle, disabled }: NotificationPrefRowProps) {
  const anyOn = row.in_app_enabled || (row.email_enabled && row.email_available);

  return (
    <>
      <HStack gap={6} vAlign="start" hAlign="between" paddingBlock={4}>
        <StackItem size="fill">
          <VStack gap={1}>
            <HStack gap={2} vAlign="center">
              <Text weight="medium">{row.label}</Text>
              <Badge variant={anyOn ? 'success' : 'neutral'} label={anyOn ? 'On' : 'Off'} />
            </HStack>
            <Text type="supporting" color="secondary" display="block" className="font-mono">
              {row.event_type}
            </Text>
          </VStack>
        </StackItem>
        <HStack gap={6} vAlign="start">
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
        </HStack>
      </HStack>
      <Divider />
    </>
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
    <VStack gap={1} hAlign="center">
      <Text type="supporting" weight="medium" color="secondary">
        {label}
      </Text>
      <Switch
        label={`Toggle ${label.toLowerCase()} notifications`}
        isLabelHidden
        value={checked}
        isDisabled={disabled}
        onChange={onCheckedChange}
      />
    </VStack>
  );
}
