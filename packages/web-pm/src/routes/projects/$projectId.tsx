import { createFileRoute } from '@tanstack/react-router';
import { ProjectDetailPage } from '../../pages/project-detail-page.tsx';

export const Route = createFileRoute('/_authed/pm/projects/$projectId')({
  component: ProjectDetailPage,
});
