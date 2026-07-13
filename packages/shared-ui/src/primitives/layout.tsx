import {
  Layout as AstryxLayout,
  LayoutContent as AstryxLayoutContent,
  LayoutFooter as AstryxLayoutFooter,
  LayoutHeader as AstryxLayoutHeader,
} from '@astryxdesign/core/Layout';
import type { ComponentProps } from 'react';

export type LayoutProps = ComponentProps<typeof AstryxLayout>;
export function Layout(props: LayoutProps) {
  return <AstryxLayout {...props} />;
}

export type LayoutHeaderProps = ComponentProps<typeof AstryxLayoutHeader>;
export function LayoutHeader(props: LayoutHeaderProps) {
  return <AstryxLayoutHeader {...props} />;
}

export type LayoutContentProps = ComponentProps<typeof AstryxLayoutContent>;
export function LayoutContent(props: LayoutContentProps) {
  return <AstryxLayoutContent {...props} />;
}

export type LayoutFooterProps = ComponentProps<typeof AstryxLayoutFooter>;
export function LayoutFooter(props: LayoutFooterProps) {
  return <AstryxLayoutFooter {...props} />;
}
