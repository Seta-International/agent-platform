import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidePanel } from './side-panel';

describe('SidePanel', () => {
  it('renders header + body slots', () => {
    render(
      <SidePanel header={<span>HEAD</span>}>
        <p>BODY</p>
      </SidePanel>,
    );
    expect(screen.getByText('HEAD')).toBeInTheDocument();
    expect(screen.getByText('BODY')).toBeInTheDocument();
  });
});
