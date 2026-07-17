import * as stylex from '@stylexjs/stylex';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthBackdrop } from '../../../src/composites/auth-backdrop';

// vitest runs StyleX with `runtimeInjection: false` (see src/testing/vitest-preset.ts),
// so no stylesheet exists and getComputedStyle reports nothing. StyleX atomic classes
// are content-hashed per property+value, though, so compiling the expected declaration
// here yields the exact class the component must carry — `pointerEvents: 'none'` and
// `pointerEvents: 'auto'` hash differently, so this fails on removal *or* on change.
const expected = stylex.create({
  noPointerEvents: { pointerEvents: 'none' },
});

const noPointerEventsClass = stylex.props(expected.noPointerEvents).className?.split(' ').at(-1);

/** The mesh svg, located structurally rather than by test id. */
function meshSvg(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('svg');
  expect(svg, 'AuthBackdrop should render a mesh svg').not.toBeNull();
  return svg as SVGSVGElement;
}

describe('AuthBackdrop', () => {
  it('renders its children', () => {
    render(
      <AuthBackdrop>
        <button type="button">Sign in</button>
      </AuthBackdrop>,
    );
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('hides the decorative mesh from assistive tech', () => {
    const { container } = render(
      <AuthBackdrop>
        <button type="button">Sign in</button>
      </AuthBackdrop>,
    );

    expect(meshSvg(container)).toHaveAttribute('aria-hidden', 'true');

    // Nothing decorative reaches the a11y tree, and the hiding is scoped to the mesh:
    // the child stays exposed, so this also fails if aria-hidden creeps up to the root.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('graphics-document')).not.toBeInTheDocument();
  });

  it('makes the decorative mesh transparent to pointer events', () => {
    const { container } = render(
      <AuthBackdrop>
        <button type="button">Sign in</button>
      </AuthBackdrop>,
    );

    expect(noPointerEventsClass).toBeTruthy();
    const layer = meshSvg(container).parentElement;
    expect(layer?.className.split(' ')).toContain(noPointerEventsClass);
  });
});
