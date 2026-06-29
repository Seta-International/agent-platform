import { createFileRoute } from '@tanstack/react-router';
import { Directory } from '../users/pages/Directory.tsx';

export const Route = createFileRoute('/_authed/admin/users')({
  component: Directory,
});
