import { EmptyState } from '@seta/shared-ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

function Page() {
  const navigate = useNavigate();
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <EmptyState
        title="No access"
        description="You don't have permission to view this page."
        action={{ label: 'Go home', onClick: () => void navigate({ to: '/' }) }}
      />
    </div>
  );
}

export const Route = createFileRoute('/403')({ component: Page });
