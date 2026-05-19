import { createFileRoute } from '@tanstack/react-router';
import { ProfileSettings } from '@/modules/identity/pages/ProfileSettings.tsx';

export const Route = createFileRoute('/_authed/profile')({ component: ProfileSettings });
