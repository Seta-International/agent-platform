import type * as React from 'react';

export interface SetaLogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  height?: number;
}

export function SetaLogo({ height = 36, ...props }: SetaLogoProps) {
  return <img src="/brand/seta-logo.svg" alt="Seta" height={height} {...props} />;
}
