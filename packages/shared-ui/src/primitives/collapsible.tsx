import {
  Collapsible as AstryxCollapsible,
  type CollapsibleProps as AstryxCollapsibleProps,
} from '@astryxdesign/core/Collapsible';
import { cn } from '../lib/cn';

export type {
  CollapsibleGroupProps,
  UseCollapsibleOptions,
  UseCollapsibleReturn,
} from '@astryxdesign/core/Collapsible';
export { CollapsibleGroup, useCollapsible } from '@astryxdesign/core/Collapsible';

export interface CollapsibleProps extends AstryxCollapsibleProps {
  /**
   * Lay the trigger out as a section header rather than as a line of text: comfortable
   * padding, the chevron leading instead of trailing, and content that fills the row so
   * anything aligned to its end reaches the far edge.
   *
   * All three have to come from a stylesheet. Astryx renders the trigger as
   * `[content][chevron]`, the content is a plain flex item that takes its own width, and
   * StyleX has no child selectors — so neither the trigger's content nor the
   * Collapsible's own `xstyle` can reach the parts that need to move. See
   * `styles/globals.css`; this class is the whole mechanism.
   *
   * Opt-in, because it is wrong for the other shape a Collapsible takes: a short inline
   * disclosure reads better with the chevron trailing the word it opens, and padding
   * around a single word is just a bigger hit area for no gain.
   */
  hasHeaderTrigger?: boolean;
}

export function Collapsible({ hasHeaderTrigger, className, ...props }: CollapsibleProps) {
  return (
    <AstryxCollapsible
      {...props}
      className={cn(hasHeaderTrigger && 'seta-collapsible-header-trigger', className)}
    />
  );
}
