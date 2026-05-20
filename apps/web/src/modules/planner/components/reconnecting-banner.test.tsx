import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useConnectionStatus } from '../state/connection-status';
import { ReconnectingBanner } from './reconnecting-banner';

beforeEach(() => useConnectionStatus.setState({ status: 'idle' }));

describe('ReconnectingBanner', () => {
  it('does not render when status is open', () => {
    useConnectionStatus.setState({ status: 'open' });
    render(<ReconnectingBanner />);
    expect(screen.queryByTestId('reconnecting-banner')).toBeNull();
  });

  it('renders Reconnecting… when status is reconnecting', () => {
    useConnectionStatus.setState({ status: 'reconnecting' });
    render(<ReconnectingBanner />);
    expect(screen.getByTestId('reconnecting-banner')).toHaveTextContent('Reconnecting…');
  });
});
