import {
  Tokenizer as AstryxTokenizer,
  type TokenizerChange,
  type TokenizerProps,
} from '@astryxdesign/core/Tokenizer';
import type { SearchableItem } from '@astryxdesign/core/Typeahead';

export type { TokenizerChange, TokenizerProps };

export function Tokenizer<T extends SearchableItem>(props: TokenizerProps<T>) {
  return <AstryxTokenizer<T> {...props} />;
}
Tokenizer.displayName = 'Tokenizer';
