import { createFileRoute } from '@tanstack/react-router';
import { ProjectsPage } from '../../pages/projects-page.tsx';

export const Route = createFileRoute('/_authed/pm/projects/')({
  component: ProjectsPage,
});
