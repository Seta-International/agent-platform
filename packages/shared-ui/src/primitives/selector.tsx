import {
  Selector as AstryxSelector,
  SelectorOption as AstryxSelectorOption,
} from '@astryxdesign/core/Selector';
import type { ComponentProps } from 'react';

export type { SelectorOptionData, SelectorOptionType } from '@astryxdesign/core/Selector';

export type SelectorProps = ComponentProps<typeof AstryxSelector>;

export function Selector(props: SelectorProps) {
  return <AstryxSelector {...props} />;
}
Selector.displayName = 'Selector';

export type SelectorOptionProps = ComponentProps<typeof AstryxSelectorOption>;

export function SelectorOption(props: SelectorOptionProps) {
  return <AstryxSelectorOption {...props} />;
}
SelectorOption.displayName = 'SelectorOption';
