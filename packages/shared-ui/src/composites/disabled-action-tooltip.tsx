import type { ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../primitives/tooltip';

export interface DisabledActionTooltipProps {
  /** When true, render children inside a non-interactive wrapper and explain why on hover/focus. */
  disabled: boolean;
  /** Explanation shown in the tooltip — typically why the action is unavailable. */
  reason: ReactNode;
  children: ReactNode;
}

/**
 * Wraps a disabled control so a hover/focus tooltip still fires. A disabled `<button>` carries
 * `pointer-events-none`, which would otherwise swallow pointer events before the tooltip can open;
 * we wrap the child in a focusable span that captures hover and keyboard focus. When `disabled` is
 * false the children render untouched (no wrapper, no tooltip).
 *
 * Used to satisfy the "disable + explain" treatment for actions the current user lacks permission
 * to perform. The caller is responsible for also passing `disabled` to the underlying control.
 */
export function DisabledActionTooltip({ disabled, reason, children }: DisabledActionTooltipProps) {
  if (!disabled) return <>{children}</>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: the wrapped control is disabled (and
              thus unfocusable), so the span must take focus to keep the reason reachable by keyboard. */}
          <span tabIndex={0} className="inline-flex cursor-not-allowed">
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
