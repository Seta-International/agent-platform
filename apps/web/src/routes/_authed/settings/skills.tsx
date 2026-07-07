import { SkillsPage } from '@seta/web-identity';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/settings/skills')({ component: SkillsPage });
