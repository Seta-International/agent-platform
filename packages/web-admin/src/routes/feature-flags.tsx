import { createFileRoute } from '@tanstack/react-router';
import { FeatureFlags } from '../feature-flags/pages/FeatureFlags.tsx';

export const Route = createFileRoute('/_authed/admin/feature-flags')({
  component: FeatureFlags,
});
