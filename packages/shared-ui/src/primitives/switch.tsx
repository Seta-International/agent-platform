import { Switch as AstryxSwitch } from '@astryxdesign/core/Switch';
import type { ComponentProps } from 'react';

export type SwitchProps = ComponentProps<typeof AstryxSwitch>;

export function Switch(props: SwitchProps) {
  return <AstryxSwitch {...props} />;
}
