import { EmptyState } from '@seta/shared-ui';

export function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <EmptyState
        title="404 — Page not found"
        description="The URL you typed doesn't exist (or is no longer here)."
        action={{
          label: 'Go home',
          onClick: () => {
            window.location.href = '/';
          },
        }}
      />
    </div>
  );
}
