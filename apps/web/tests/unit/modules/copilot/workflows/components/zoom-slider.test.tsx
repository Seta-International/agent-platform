import { fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { ZoomSlider } from '../../../../../../src/modules/copilot/workflows/components/zoom-slider.tsx';

const zoomIn = vi.fn();
const zoomOut = vi.fn();
const fitView = vi.fn();
const getZoom = vi.fn().mockReturnValue(1);

vi.mock('@xyflow/react', async (orig) => {
  const actual = await orig<typeof import('@xyflow/react')>();
  return { ...actual, useReactFlow: () => ({ zoomIn, zoomOut, fitView, getZoom }) };
});

describe('ZoomSlider', () => {
  it('invokes zoomIn / zoomOut / fitView on click', () => {
    render(
      <ReactFlowProvider>
        <ZoomSlider />
      </ReactFlowProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /zoom in/i }));
    expect(zoomIn).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /zoom out/i }));
    expect(zoomOut).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /fit/i }));
    expect(fitView).toHaveBeenCalled();
  });
});
