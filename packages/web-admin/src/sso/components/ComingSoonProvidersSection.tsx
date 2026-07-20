import { Badge, InfoRow, SettingsSection, Text, VStack } from '@seta/shared-ui';

interface PreviewProvider {
  id: string;
  name: string;
  description: string;
}

const PROVIDERS: ReadonlyArray<PreviewProvider> = [
  {
    id: 'google',
    name: 'Google Workspace',
    description: 'Sign in with Google Workspace accounts.',
  },
  {
    id: 'okta',
    name: 'Okta',
    description: 'Sign in with Okta.',
  },
  {
    id: 'saml',
    name: 'Generic SAML 2.0',
    description: 'Connect any SAML 2.0 provider.',
  },
];

export function ComingSoonProvidersSection() {
  return (
    <SettingsSection title="More providers" description="Coming soon.">
      {PROVIDERS.map((p) => (
        <InfoRow
          key={p.id}
          label={p.name}
          value={p.description}
          action={<Badge variant="neutral" label="Soon" />}
        />
      ))}
      <VStack paddingBlock={4}>
        <Text type="supporting" color="secondary" display="block">
          Need a different provider? Talk to support.
        </Text>
      </VStack>
    </SettingsSection>
  );
}
