import { Badge as AstryxBadge } from '@astryxdesign/core/Badge';
import type { ComponentProps } from 'react';

export type BadgeProps = ComponentProps<typeof AstryxBadge>;

export function Badge(props: BadgeProps) {
  return <AstryxBadge {...props} />;
}
