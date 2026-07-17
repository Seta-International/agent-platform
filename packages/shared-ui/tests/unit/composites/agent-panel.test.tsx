import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentPanel } from '../../../src/composites/agent-panel';

function panelEl() {
  return screen.getByRole('complementary', { name: 'Agent' });
}
function grip() {
  return screen.getByRole('separator', { name: 'Resize agent panel' });
}

describe('AgentPanel', () => {
  it('renders children inside an aside labeled Agent', () => {
    render(
      <AgentPanel storageKey={null}>
        <div>panel body</div>
      </AgentPanel>,
    );
    expect(panelEl()).toBeInTheDocument();
    expect(screen.getByText('panel body')).toBeInTheDocument();
  });

  it('fills its column height as a flex column', () => {
    render(<AgentPanel storageKey={null}>content</AgentPanel>);
    const aside = panelEl();
    expect(aside.className).toContain('h-full');
    expect(aside.className).toContain('flex-col');
  });

  it('exposes an owned, left-docked resize separator with aria bounds', () => {
    render(
      <AgentPanel storageKey={null} defaultWidth={400} minWidth={320} maxWidth={720}>
        content
      </AgentPanel>,
    );
    const handle = grip();
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle).toHaveAttribute('aria-valuenow', '400');
    expect(handle).toHaveAttribute('aria-valuemin', '320');
    expect(handle).toHaveAttribute('aria-valuemax', '720');
    expect(handle).toHaveAttribute('tabindex', '0');
    // Grip sits on the left edge of the right-docked panel.
    expect(handle.className).toContain('left-0');
  });

  it('reads initial width from localStorage under the raw storage key', () => {
    window.localStorage.setItem('k', '500');
    render(<AgentPanel storageKey="k">c</AgentPanel>);
    expect(panelEl()).toHaveStyle({ width: '500px' });
    window.localStorage.removeItem('k');
  });

  it('clamps a stored width outside range to the bounds', () => {
    window.localStorage.setItem('k', '9999');
    render(
      <AgentPanel storageKey="k" defaultWidth={400} minWidth={320} maxWidth={720}>
        c
      </AgentPanel>,
    );
    expect(panelEl()).toHaveStyle({ width: '720px' });
    window.localStorage.removeItem('k');
  });

  it('drag widens the right-docked panel and persists on release', () => {
    render(
      <AgentPanel storageKey="k" defaultWidth={400} minWidth={320} maxWidth={720}>
        c
      </AgentPanel>,
    );
    fireEvent.pointerDown(grip(), { clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 940 }); // moved left 60 → +60 width
    fireEvent.pointerUp(window, { clientX: 940 });
    expect(panelEl()).toHaveStyle({ width: '460px' });
    expect(window.localStorage.getItem('k')).toBe('460');
    window.localStorage.removeItem('k');
  });

  it('ArrowLeft widens, ArrowRight narrows, clamped to max', () => {
    render(
      <AgentPanel storageKey="k" defaultWidth={700} minWidth={320} maxWidth={720}>
        c
      </AgentPanel>,
    );
    fireEvent.keyDown(grip(), { key: 'ArrowLeft', shiftKey: true }); // +32 → clamp 720
    expect(panelEl()).toHaveStyle({ width: '720px' });
    expect(window.localStorage.getItem('k')).toBe('720');
    window.localStorage.removeItem('k');
  });

  it('does not touch localStorage when storageKey is null', () => {
    render(
      <AgentPanel storageKey={null} defaultWidth={400} minWidth={320} maxWidth={720}>
        c
      </AgentPanel>,
    );
    fireEvent.keyDown(grip(), { key: 'ArrowLeft' });
    expect(window.localStorage.length).toBe(0);
  });
});
