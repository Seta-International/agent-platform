import { type ChangeEvent, type CompositionEvent, useRef } from 'react';

/**
 * Input handlers that defer change propagation until an IME composition session
 * completes. Wiring `onChange` straight to a controlled value round-trips the
 * value mid-composition and corrupts IME buffers — Vietnamese Telex input for
 * "điện" comes out as "đđiệênn". While composing we swallow intermediate input
 * events and emit the committed text once on `compositionend`. [FUT-34]
 */
export function useImeComposition(onCommit: (value: string) => void) {
  const composingRef = useRef(false);

  return {
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      if (composingRef.current) return;
      onCommit(e.target.value);
    },
    onCompositionStart: () => {
      composingRef.current = true;
    },
    onCompositionEnd: (e: CompositionEvent<HTMLInputElement>) => {
      composingRef.current = false;
      onCommit(e.currentTarget.value);
    },
  };
}
