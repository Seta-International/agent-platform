import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './error-boundary';

function Bomb(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders ServerError fallback when child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    spy.mockRestore();
  });
});
