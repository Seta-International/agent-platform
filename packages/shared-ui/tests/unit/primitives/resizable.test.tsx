import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResizeHandle, useResizable } from '../../../src/primitives/resizable';

function Harness() {
  const panel = useResizable({ defaultSize: 320, minSizePx: 200, maxSizePx: 480 });
  return (
    <div>
      <span data-testid="size">{panel.size}</span>
      <ResizeHandle resizable={panel.props} label="Resize panel" />
    </div>
  );
}

describe('Resizable barrel', () => {
  it('re-exports useResizable (size state) and ResizeHandle (separator)', () => {
    render(<Harness />);
    expect(screen.getByTestId('size')).toHaveTextContent('320');
    expect(screen.getByRole('separator', { name: 'Resize panel' })).toBeInTheDocument();
  });
});
