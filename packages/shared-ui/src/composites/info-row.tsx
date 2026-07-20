import type { ReactNode } from 'react';
import { Divider } from '../primitives/divider';
import { HStack, VStack } from '../primitives/layout';
import { Text } from '../primitives/text';

export interface InfoRowProps {
  label: string;
  /** Current value line under the label (string or inline nodes). */
  value: ReactNode;
  /** Trailing action — a real Button/Link node, not a string; rows trigger mutations, not navigation. */
  action?: ReactNode;
}

/** Settings-template read-only row: label + value on the left, action on the right, divider below. */
export function InfoRow({ label, value, action }: InfoRowProps) {
  return (
    <>
      <HStack hAlign="between" vAlign="start" gap={4} paddingBlock={4}>
        <VStack gap={0}>
          <Text weight="semibold" display="block">
            {label}
          </Text>
          <Text type="supporting" color="secondary" display="block">
            {value}
          </Text>
        </VStack>
        {action}
      </HStack>
      <Divider />
    </>
  );
}
