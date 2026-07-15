import {
  Dialog as AstryxDialog,
  DialogHeader as AstryxDialogHeader,
  type DialogProps as AstryxDialogProps,
} from '@astryxdesign/core/Dialog';
import type { ComponentProps } from 'react';

export type DialogProps = AstryxDialogProps;
export function Dialog({ isOpen, ...props }: DialogProps) {
  // Return null when closed to avoid eager DOM mounting
  if (!isOpen) {
    return null;
  }
  return <AstryxDialog isOpen={isOpen} {...props} />;
}

export type DialogHeaderProps = ComponentProps<typeof AstryxDialogHeader>;
export function DialogHeader(props: DialogHeaderProps) {
  return <AstryxDialogHeader {...props} />;
}
