import type { ReactNode } from 'react';
import { HStack, LayoutFooter } from '../primitives/layout';

export interface DialogFooterProps {
  /**
   * Action buttons for the dialog. Laid out in a right-aligned row with
   * consistent spacing. Order them Cancel-first, primary action last.
   */
  children: ReactNode;
  /**
   * Optional content pinned to the left of the footer — a checkbox, a status
   * line, a keyboard hint. When set, the footer becomes a space-between row
   * with the actions kept on the right.
   */
  startContent?: ReactNode;
  /**
   * Themed divider along the top edge. On by default because a dialog footer
   * always separates actions from the content above it.
   * @default true
   */
  hasDivider?: boolean;
}

/**
 * Standard action bar for a `Dialog`'s `footer` slot. `LayoutFooter` is a bare
 * slot with no arrangement of its own, so buttons dropped straight into it flow
 * left with no gap. This wraps them in a right-aligned `HStack` so every dialog
 * reads the same: secondary actions first, the primary action on the right.
 */
export function DialogFooter({ children, startContent, hasDivider = true }: DialogFooterProps) {
  return (
    <LayoutFooter hasDivider={hasDivider}>
      {startContent ? (
        <HStack gap={2} hAlign="between" vAlign="center">
          {startContent}
          <HStack gap={2} vAlign="center">
            {children}
          </HStack>
        </HStack>
      ) : (
        <HStack gap={2} hAlign="end" vAlign="center">
          {children}
        </HStack>
      )}
    </LayoutFooter>
  );
}
