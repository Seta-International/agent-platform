import { TextInput as AstryxTextInput } from '@astryxdesign/core/TextInput';
import type { ComponentProps } from 'react';

export type InputProps = ComponentProps<typeof AstryxTextInput>;

export function Input(props: InputProps) {
  return <AstryxTextInput {...props} />;
}
