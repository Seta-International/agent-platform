import { createFileRoute } from '@tanstack/react-router';
import { M365DirectorySync } from '../m365-directory/pages/M365DirectorySync.tsx';

export const Route = createFileRoute('/_authed/admin/m365-directory')({
  component: M365DirectorySync,
});
