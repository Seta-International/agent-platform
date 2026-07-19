import type { ReactNode } from 'react';
import { Button } from '../primitives/button';
import { Divider } from '../primitives/divider';
import { HStack, VStack } from '../primitives/layout';
import { Text } from '../primitives/text';

export interface ExpandableRowProps {
  label: string;
  /** Read-only value shown while collapsed. */
  value: ReactNode;
  isExpanded: boolean;
  /** Disables Save/Cancel while the caller's mutation is pending. */
  isSaving?: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  /** The editor control(s) shown when expanded. */
  children: ReactNode;
}

/** Settings-template edit-in-place row: collapsed label/value + Edit, expanded editor + Save/Cancel. */
export function ExpandableRow({
  label,
  value,
  isExpanded,
  isSaving,
  onEdit,
  onCancel,
  onSave,
  children,
}: ExpandableRowProps) {
  return (
    <>
      {isExpanded ? (
        <VStack gap={4} paddingBlock={4}>
          <Text weight="semibold" display="block">
            {label}
          </Text>
          {children}
          <HStack gap={2}>
            <Button label="Save" variant="primary" onClick={onSave} isDisabled={isSaving} />
            <Button label="Cancel" variant="ghost" onClick={onCancel} isDisabled={isSaving} />
          </HStack>
        </VStack>
      ) : (
        <HStack hAlign="between" vAlign="start" gap={4} paddingBlock={4}>
          <VStack gap={0}>
            <Text weight="semibold" display="block">
              {label}
            </Text>
            <Text type="supporting" color="secondary" display="block">
              {value}
            </Text>
          </VStack>
          <Button variant="ghost" size="sm" label="Edit" onClick={onEdit} />
        </HStack>
      )}
      <Divider />
    </>
  );
}
