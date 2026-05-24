import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toaster } from '../../../src/primitives/toast';

describe('Toaster', () => {
  it('renders sonner toaster without crashing', () => {
    const { container } = render(<Toaster />);
    expect(container).toBeInTheDocument();
  });
});
