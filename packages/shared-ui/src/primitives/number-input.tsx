import { NumberInput as AstryxNumberInput } from '@astryxdesign/core/NumberInput';
import type { ComponentProps } from 'react';

export type NumberInputProps = ComponentProps<typeof AstryxNumberInput>;

export function NumberInput(props: NumberInputProps) {
  return <AstryxNumberInput {...props} />;
}
