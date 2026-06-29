import { createFileRoute } from '@tanstack/react-router';
import { SkillsCatalog } from '../skills/pages/SkillsCatalog.tsx';

export const Route = createFileRoute('/_authed/admin/skills')({
  component: SkillsCatalog,
});
