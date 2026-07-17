import { Selector as AstryxSelector } from '@astryxdesign/core/Selector';
import type { ComponentProps } from 'react';

export type { SelectorOptionData, SelectorOptionType } from '@astryxdesign/core/Selector';

export type SelectorProps = ComponentProps<typeof AstryxSelector>;

export function Selector(props: SelectorProps) {
  return <AstryxSelector {...props} />;
}
Selector.displayName = 'Selector';
