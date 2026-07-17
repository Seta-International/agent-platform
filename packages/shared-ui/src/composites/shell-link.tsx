import type * as React from 'react';

export interface ShellLinkProps {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  title?: string;
  'aria-current'?: 'page' | undefined;
  /** Behavior-carrying crumbs (Astryx Breadcrumbs) rely on this reaching the rendered `<a>`. */
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}
export type ShellLinkComponent = React.ComponentType<ShellLinkProps>;

export const DefaultShellLink: ShellLinkComponent = ({
  href,
  className,
  style,
  children,
  ...rest
}) => (
  <a href={href} className={className} style={style} {...rest}>
    {children}
  </a>
);
