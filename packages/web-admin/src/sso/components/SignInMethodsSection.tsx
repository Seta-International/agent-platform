import {
  Badge,
  Banner,
  Divider,
  HStack,
  SettingsSection,
  StackItem,
  Switch,
  Text,
  VStack,
} from '@seta/shared-ui';
import { useState } from 'react';
import { setLocalPasswordDisabled } from '../api/sso-client.ts';

interface SignInMethodsSectionProps {
  localPasswordDisabled: boolean;
  hasEnabledProvider: boolean;
  onChanged: () => void;
}

interface MethodRowProps {
  title: string;
  description: React.ReactNode;
  enabled: boolean;
  disabledSwitch?: boolean;
  busy?: boolean;
  onToggle?: (next: boolean) => void;
}

function MethodRow({
  title,
  description,
  enabled,
  disabledSwitch,
  busy,
  onToggle,
}: MethodRowProps) {
  return (
    <>
      <HStack gap={4} vAlign="start" hAlign="between" paddingBlock={4}>
        <StackItem size="fill">
          <VStack gap={1}>
            <HStack gap={2} vAlign="center">
              <Text weight="medium">{title}</Text>
              <Badge
                variant={enabled ? 'success' : 'neutral'}
                label={enabled ? 'Enabled' : 'Disabled'}
              />
            </HStack>
            <Text color="secondary" display="block">
              {description}
            </Text>
          </VStack>
        </StackItem>
        <Switch
          label={title}
          isLabelHidden
          value={enabled}
          isDisabled={disabledSwitch || busy}
          onChange={onToggle ? (v) => onToggle(v) : undefined}
        />
      </HStack>
      <Divider />
    </>
  );
}

export function SignInMethodsSection({
  localPasswordDisabled,
  hasEnabledProvider,
  onChanged,
}: SignInMethodsSectionProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleToggle(checked: boolean) {
    const newDisabled = !checked;
    if (newDisabled && !hasEnabledProvider) return;

    setBusy(true);
    setError(null);
    try {
      await setLocalPasswordDisabled(newDisabled);
      onChanged();
    } catch (e) {
      const msg = (e as Error).message;
      setError(
        msg.includes('404') || msg.includes('HTTP 404') ? "This setting isn't available yet." : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  const localEnabled = !localPasswordDisabled;
  const localDisableBlocked = localEnabled && !hasEnabledProvider;

  return (
    <SettingsSection
      title="Sign-in methods"
      description="Choose how people in your organization sign in."
    >
      <MethodRow
        title="Password sign-in"
        description={
          localDisableBlocked
            ? 'Connect Microsoft Entra ID first, then you can turn off password sign-in.'
            : 'People can sign in with email and password. Turn off to require SSO.'
        }
        enabled={localEnabled}
        disabledSwitch={localDisableBlocked && localEnabled}
        busy={busy}
        onToggle={handleToggle}
      />
      <MethodRow
        title="Single sign-on"
        description={
          hasEnabledProvider
            ? 'People sign in through your connected provider.'
            : 'Connect a provider above to turn this on.'
        }
        enabled={hasEnabledProvider}
        disabledSwitch
      />
      {error && <Banner status="error" title={error} />}
    </SettingsSection>
  );
}
