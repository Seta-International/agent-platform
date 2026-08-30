import { VisuallyHidden as AstryxVisuallyHidden } from '@astryxdesign/core/VisuallyHidden';
import type { ComponentProps } from 'react';

export type VisuallyHiddenProps = ComponentProps<typeof AstryxVisuallyHidden>;

export function VisuallyHidden(props: VisuallyHiddenProps) {
  return <AstryxVisuallyHidden {...props} />;
}
