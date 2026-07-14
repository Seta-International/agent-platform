import { CheckboxInput as AstryxCheckboxInput } from '@astryxdesign/core/CheckboxInput';
import type { ComponentProps } from 'react';

export type CheckboxProps = ComponentProps<typeof AstryxCheckboxInput>;

export function Checkbox(props: CheckboxProps) {
  return <AstryxCheckboxInput {...props} />;
}
