import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { directorySearchSchema } from '../users/directory-search.ts';
import { Directory } from '../users/pages/Directory.tsx';

export const Route = createFileRoute('/_authed/admin/users')({
  validateSearch: directorySearchSchema,
  component: function DirectoryRoute() {
    const search = Route.useSearch();
    const navigate = useNavigate({ from: Route.fullPath });
    return (
      <Directory
        search={search}
        onSearch={(next) => {
          void navigate({ search: (prev) => next(prev) });
        }}
      />
    );
  },
});
