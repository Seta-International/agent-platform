import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../../../src/pages/_ui-compat.tsx';

describe('_ui-compat Button', () => {
  it('gives a labelled button its icon a wrapper that cannot shrink', () => {
    render(
      <Button label="Columns" variant="secondary" size="sm" icon={<svg data-testid="icon" />} />,
    );

    const wrapper = screen.getByTestId('icon').parentElement;

    expect(wrapper?.tagName).toBe('SPAN');
    expect(wrapper?.className).toContain('shrink-0');
  });

  it('gives an icon-only button its icon a wrapper that cannot shrink', () => {
    render(<Button isIconOnly label="Reassign" size="sm" icon={<svg data-testid="icon" />} />);

    const wrapper = screen.getByTestId('icon').parentElement;

    expect(wrapper?.tagName).toBe('SPAN');
    expect(wrapper?.className).toContain('shrink-0');
  });

  it('renders no icon wrapper when no icon is passed', () => {
    render(<Button label="Save" />);

    expect(screen.getByRole('button').querySelector('span')).toBeNull();
  });
});
