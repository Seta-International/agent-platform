import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KbdHint } from './kbd-hint';

describe('KbdHint', () => {
  it('renders <kbd> with the key label', () => {
    render(<KbdHint keys={['⌘', 'K']} />);
    expect(screen.getByText('⌘')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });
});
