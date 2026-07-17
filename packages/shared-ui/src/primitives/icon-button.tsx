import { IconButton as AstryxIconButton } from '@astryxdesign/core/IconButton';
import type { ComponentProps } from 'react';

export type IconButtonProps = ComponentProps<typeof AstryxIconButton>;

export function IconButton(props: IconButtonProps) {
  return <AstryxIconButton {...props} />;
}
