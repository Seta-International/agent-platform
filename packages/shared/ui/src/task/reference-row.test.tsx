import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReferenceRow } from './reference-row';

describe('ReferenceRow', () => {
  const row = {
    id: 'r1',
    url: 'https://docs.acme.com/x',
    alias: 'Architecture notes',
    host: 'docs.acme.com',
    type: 'word' as const,
  };
  it('renders alias + host + type badge', () => {
    render(<ReferenceRow refRow={row} onOpen={() => {}} onRemove={() => {}} />);
    expect(screen.getByText('Architecture notes')).toBeInTheDocument();
    expect(screen.getByText('docs.acme.com')).toBeInTheDocument();
    expect(screen.getByText('word')).toBeInTheDocument();
  });
  it('falls back to URL host when alias missing', () => {
    render(<ReferenceRow refRow={{ ...row, alias: null }} onOpen={() => {}} onRemove={() => {}} />);
    expect(screen.getByText('docs.acme.com')).toBeInTheDocument();
  });
  it('calls onOpen when the external button clicked', () => {
    const onOpen = vi.fn();
    render(<ReferenceRow refRow={row} onOpen={onOpen} onRemove={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Open/ }));
    expect(onOpen).toHaveBeenCalledWith(row);
  });
  it('calls onRemove when × clicked', () => {
    const onRemove = vi.fn();
    render(<ReferenceRow refRow={row} onOpen={() => {}} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
    expect(onRemove).toHaveBeenCalledWith(row);
  });
  it('renders the per-type color: word=#2b579a, excel=#1f8a4c, powerPoint=#d24726', () => {
    const types = ['word', 'excel', 'powerPoint'] as const;
    const expected = ['#2b579a', '#1f8a4c', '#d24726'];
    types.forEach((t, i) => {
      const { container, unmount } = render(
        <ReferenceRow refRow={{ ...row, type: t }} onOpen={() => {}} onRemove={() => {}} />,
      );
      const icon = container.querySelector('[aria-hidden="true"]') as HTMLElement;
      expect(icon.style.background).toBe(expected[i]);
      unmount();
    });
  });
});
