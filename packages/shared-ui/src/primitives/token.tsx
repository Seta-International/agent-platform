import {
  Token as AstryxToken,
  type TokenColor,
  type TokenProps,
  type TokenSize,
} from '@astryxdesign/core/Token';

export type { TokenColor, TokenProps, TokenSize };

export function Token(props: TokenProps) {
  return <AstryxToken {...props} />;
}
Token.displayName = 'Token';
