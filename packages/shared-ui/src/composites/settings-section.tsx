import type { ReactNode } from 'react';
import { Divider } from '../primitives/divider';
import { VStack } from '../primitives/layout';
import { Heading, Text } from '../primitives/text';

export interface SettingsSectionProps {
  /** Section heading, rendered as a level-3 heading. */
  title: string;
  /** Optional supporting line under the heading. */
  description?: string;
  /** Rows: InfoRow / ExpandableRow / Switch rows. Each row draws its own bottom divider. */
  children: ReactNode;
}

/**
 * Settings-template section: heading (+ optional description), a divider, then
 * rows. Replaces the hand-rolled `section/header/divide-y` card idiom.
 */
export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <VStack gap={0}>
      <VStack gap={0} style={{ paddingBlockEnd: 'var(--spacing-2)' }}>
        <Heading level={3}>{title}</Heading>
        {description && (
          <Text type="supporting" color="secondary" display="block">
            {description}
          </Text>
        )}
      </VStack>
      <Divider />
      {children}
    </VStack>
  );
}
