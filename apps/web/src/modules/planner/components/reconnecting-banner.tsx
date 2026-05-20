import { useConnectionStatus } from '../state/connection-status';

export function ReconnectingBanner() {
  const status = useConnectionStatus((s) => s.status);
  if (status !== 'reconnecting') return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="reconnecting-banner"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md text-sm font-medium shadow-md border"
      style={{
        background: 'var(--color-semantic-warning-tint)',
        borderColor: 'var(--color-semantic-warning)',
        color: 'var(--color-ink)',
      }}
    >
      Reconnecting…
    </div>
  );
}
