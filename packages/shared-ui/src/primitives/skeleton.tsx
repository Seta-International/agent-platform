import { Skeleton as AstryxSkeleton } from '@astryxdesign/core/Skeleton';
import type { ComponentProps } from 'react';

export type SkeletonProps = ComponentProps<typeof AstryxSkeleton>;

export function Skeleton(props: SkeletonProps) {
  return <AstryxSkeleton {...props} />;
}
