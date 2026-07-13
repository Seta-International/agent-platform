import { Banner as AstryxBanner } from '@astryxdesign/core/Banner';
import type { ComponentProps } from 'react';

export type BannerProps = ComponentProps<typeof AstryxBanner>;

export function Banner(props: BannerProps) {
  return <AstryxBanner {...props} />;
}
