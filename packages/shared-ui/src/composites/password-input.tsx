import * as stylex from '@stylexjs/stylex';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '../primitives/icon-button';
import type { InputProps } from '../primitives/input';
import { Input } from '../primitives/input';

const styles = stylex.create({
  root: { position: 'relative', width: '100%' },
  // Bottom-anchored and sized to the control's own height token, so the toggle
  // stays centred on the control regardless of label height; Astryx renders the
  // field status as a floating box, so the control is the last in-flow element.
  toggle: {
    position: 'absolute',
    bottom: 0,
    right: 'var(--spacing-1)',
    display: 'flex',
    alignItems: 'center',
  },
  toggleSm: { height: 'var(--size-element-sm)' },
  toggleMd: { height: 'var(--size-element-md)' },
  toggleLg: { height: 'var(--size-element-lg)' },
});

const toggleHeights = { sm: styles.toggleSm, md: styles.toggleMd, lg: styles.toggleLg } as const;

export type PasswordInputProps = Omit<InputProps, 'type'>;

/**
 * Password field with a show/hide toggle — Astryx's TextInput has no end-adornment
 * slot, so the eye is overlaid on the control from outside.
 */
export function PasswordInput(props: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false);
  const size = (props.size ?? 'md') as keyof typeof toggleHeights;

  return (
    <div {...stylex.props(styles.root)}>
      <Input {...props} type={revealed ? 'text' : 'password'} />
      <div {...stylex.props(styles.toggle, toggleHeights[size])}>
        <IconButton
          label={revealed ? 'Hide password' : 'Show password'}
          icon={revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          variant="ghost"
          size="sm"
          onClick={() => setRevealed((v) => !v)}
        />
      </div>
    </div>
  );
}
