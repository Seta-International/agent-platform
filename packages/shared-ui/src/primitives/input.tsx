import { TextInput as AstryxTextInput } from '@astryxdesign/core/TextInput';
import type { ComponentProps } from 'react';
import { forwardRef } from 'react';

export type InputProps = ComponentProps<typeof AstryxTextInput>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(props, ref) {
  return <AstryxTextInput {...props} ref={ref} />;
});
Input.displayName = 'Input';
