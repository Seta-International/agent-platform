import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Center, Heading, Link } from '../../../src';

describe('Heading', () => {
  it('renders the semantic element for its level without a display type', () => {
    render(<Heading level={1}>Sign in</Heading>);
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('Link', () => {
  it('renders an anchor when href is set', () => {
    render(<Link href="mailto:a@b.com">Reset</Link>);
    expect(screen.getByRole('link', { name: 'Reset' })).toHaveAttribute('href', 'mailto:a@b.com');
  });

  // LoginCard's "Start over" needs a real button, not an <a href="#">.
  it('renders a button when href is omitted', () => {
    render(<Link onClick={() => {}}>Start over</Link>);
    expect(screen.getByRole('button', { name: 'Start over' })).toBeInTheDocument();
  });
});

describe('Center', () => {
  it('renders its children', () => {
    render(
      <Center axis="both">
        <span>content</span>
      </Center>,
    );
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
