import * as stylex from '@stylexjs/stylex';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from '../primitives/icon-button';
import { Text } from '../primitives/text';

const styles = stylex.create({
  // Astryx Token maxes out well below field scale, so this is a purpose-built
  // identity row: full-width, 40px tall to pair with size="lg" inputs, and pill
  // radius + soft fill so it cannot be mistaken for a disabled text input.
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--spacing-2)',
    width: '100%',
    height: 40,
    paddingInlineStart: 'var(--spacing-2)',
    paddingInlineEnd: 'var(--spacing-1-5)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-gray)',
  },
  // Ellipsis lives here: the wrapper clips, the inline Text inside just flows.
  label: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
});

export interface AccountChipProps {
  /** The account identifier shown in the chip (typically an email). */
  label: string;
  /** Avatar rendered at the leading edge (e.g. `<Avatar name={email} size={24} />`). */
  avatar: ReactNode;
  /** Called when the remove control is pressed. */
  onRemove: () => void;
}

/**
 * Full-width account identity row for auth flows: avatar + identifier + remove
 * control. Sized to sit alongside `size="lg"` fields.
 */
export function AccountChip({ label, avatar, onRemove }: AccountChipProps) {
  return (
    <div {...stylex.props(styles.root)}>
      {avatar}
      <span {...stylex.props(styles.label)}>
        <Text type="body" size="sm">
          {label}
        </Text>
      </span>
      <IconButton
        label={`Remove ${label}`}
        icon={<X size={14} />}
        variant="ghost"
        size="sm"
        onClick={onRemove}
      />
    </div>
  );
}
