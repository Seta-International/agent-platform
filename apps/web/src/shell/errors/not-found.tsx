import { EmptyState } from '@seta/shared-ui';

export function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <EmptyState
        title="We couldn't find that page"
        description="The link might be broken, or the page may have moved."
        action={{
          label: 'Take me home',
          onClick: () => {
            window.location.href = '/';
          },
        }}
      />
    </div>
  );
}
