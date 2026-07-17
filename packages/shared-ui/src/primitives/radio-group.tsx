import {
  RadioList as AstryxRadioList,
  RadioListItem as AstryxRadioListItem,
} from '@astryxdesign/core/RadioList';
import type { ComponentProps } from 'react';

export type RadioGroupProps = ComponentProps<typeof AstryxRadioList>;
export function RadioGroup(props: RadioGroupProps) {
  return <AstryxRadioList {...props} />;
}

export type RadioListItemProps = ComponentProps<typeof AstryxRadioListItem>;
export function RadioListItem(props: RadioListItemProps) {
  return <AstryxRadioListItem {...props} />;
}
