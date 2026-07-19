// Shared building blocks for the user detail sheet sections.
import { Heading, HStack, Text, VStack } from '@seta/shared-ui';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <VStack gap={0.5}>
      <Text type="supporting" weight="medium" color="secondary">
        {label}
      </Text>
      <Text as="div" color="primary">
        {children}
      </Text>
    </VStack>
  );
}

export function SectionTitle({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <HStack
      gap={2}
      vAlign="center"
      style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--spacing-2)' }}
    >
      <Text color="secondary">{icon}</Text>
      <Heading level={3}>{children}</Heading>
    </HStack>
  );
}
