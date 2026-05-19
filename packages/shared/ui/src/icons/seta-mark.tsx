import type * as React from 'react';

export interface SetaMarkProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  size?: number;
}

export function SetaMark({ size = 32, ...props }: SetaMarkProps) {
  return <img src="/favicon.svg" alt="Seta" width={size} height={size} {...props} />;
}
