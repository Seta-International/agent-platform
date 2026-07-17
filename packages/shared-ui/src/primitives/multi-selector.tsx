import type { MultiSelectorOptionType } from '@astryxdesign/core/MultiSelector';
import { MultiSelector as AstryxMultiSelector } from '@astryxdesign/core/MultiSelector';
import type { ComponentProps } from 'react';

export type {
  MultiSelectorOptionData,
  MultiSelectorOptionType,
} from '@astryxdesign/core/MultiSelector';

type AstryxMultiSelectorProps = ComponentProps<typeof AstryxMultiSelector>;

// Widen `options` to accept readonly arrays. Unlike Selector, MultiSelector has no
// `hasClear`-discriminated value/onChange union, so overriding `options` is safe here.
export type MultiSelectorProps = Omit<AstryxMultiSelectorProps, 'options'> & {
  options: ReadonlyArray<MultiSelectorOptionType>;
};

export function MultiSelector(props: MultiSelectorProps) {
  return <AstryxMultiSelector {...(props as AstryxMultiSelectorProps)} />;
}
MultiSelector.displayName = 'MultiSelector';
