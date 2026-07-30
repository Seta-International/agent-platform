import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SyncScrollbar } from '../../../src/composites/sync-scrollbar';

function renderWithMockElement(scrollWidth: number, clientWidth: number) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
  return render(<SyncScrollbar scrollEl={el} />);
}

describe('SyncScrollbar', () => {
  it('renders nothing when scrollEl is null', () => {
    const { container } = render(<SyncScrollbar scrollEl={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when element has no horizontal overflow', () => {
    const { container } = renderWithMockElement(500, 500);
    expect(container.querySelector('[role="presentation"]')).toBeNull();
  });

  it('renders sticky scrollbar when element has horizontal overflow', () => {
    const { container } = renderWithMockElement(1000, 500);
    const bar = container.querySelector('[role="presentation"]');
    expect(bar).not.toBeNull();
    expect(bar).toHaveClass('sticky');
    expect(bar).toHaveClass('bottom-0');
  });
});
