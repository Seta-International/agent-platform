import { Button as AstryxButton } from '@astryxdesign/core/Button';
import type { ComponentProps } from 'react';

export type ButtonProps = ComponentProps<typeof AstryxButton>;

export function Button(props: ButtonProps) {
  return <AstryxButton {...props} />;
}
