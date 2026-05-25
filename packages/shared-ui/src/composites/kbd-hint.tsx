export interface KbdHintProps {
  keys: string[];
  className?: string;
}

// Hidden for now — keep the component so call sites still compile.
// A future settings page can restore visibility or let users customize.
export function KbdHint(_props: KbdHintProps) {
  return null;
}
