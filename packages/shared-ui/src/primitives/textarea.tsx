import { TextArea as AstryxTextArea } from '@astryxdesign/core/TextArea';
import type { ComponentProps } from 'react';

export type TextareaProps = ComponentProps<typeof AstryxTextArea>;

export function Textarea(props: TextareaProps) {
  return <AstryxTextArea {...props} />;
}
