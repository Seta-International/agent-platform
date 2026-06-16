import { useSession } from '@seta/web-identity';
import { createFileRoute } from '@tanstack/react-router';

function Landing() {
  const s = useSession();
  return (
    <div className="space-y-2 p-xl">
      <h1 className="text-2xl font-semibold">Welcome, {s.display_name}</h1>
      <p className="text-muted-foreground">
        Signed in as {s.email}. Roles: {s.role_summary.roles.join(', ')}.
      </p>
    </div>
  );
}

export const Route = createFileRoute('/_authed/')({ component: Landing });
