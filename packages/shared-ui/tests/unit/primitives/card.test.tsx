import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardDescription, CardTitle } from '../../../src/primitives/card';

describe('Card', () => {
  it('renders children', () => {
    const { getByText } = render(<Card>Hello</Card>);
    expect(getByText('Hello')).toBeInTheDocument();
  });

  it('passes through Astryx props (variant, padding, width) without throwing', () => {
    const { getByTestId } = render(
      <Card variant="blue" padding={4} width={320} data-testid="c">
        content
      </Card>,
    );
    expect(getByTestId('c')).toBeInTheDocument();
  });
});

describe('CardTitle', () => {
  it('renders children with title typography classes', () => {
    const { container } = render(<CardTitle>Title</CardTitle>);
    expect(container.textContent).toBe('Title');
    expect(container.querySelector('div')?.className).toMatch(/\btext-card-title\b/);
  });
});

describe('CardDescription', () => {
  it('renders children with description typography classes', () => {
    const { container } = render(<CardDescription>Description</CardDescription>);
    expect(container.textContent).toBe('Description');
    expect(container.querySelector('div')?.className).toMatch(/\btext-body-sm\b/);
  });
});
