'use client';

import { createContext, useContext } from 'react';

/** When set, floating layers (Popover, etc.) portal here instead of document.body. */
const DialogPortalContainerContext = createContext<HTMLElement | null>(null);

export function useDialogPortalContainer(): HTMLElement | null {
  return useContext(DialogPortalContainerContext);
}

export { DialogPortalContainerContext };
