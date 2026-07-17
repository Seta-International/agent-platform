import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Section } from '../../../src/primitives/section';

describe('Section', () => {
  it('re-exports the Astryx Section and renders children', () => {
    const { getByText } = render(<Section>Panel body</Section>);
    expect(getByText('Panel body')).toBeInTheDocument();
  });

  it('passes through Astryx props (variant, padding) without throwing', () => {
    const { getByTestId } = render(
      <Section variant="muted" padding={4} data-testid="s">
        content
      </Section>,
    );
    expect(getByTestId('s')).toBeInTheDocument();
  });
});
