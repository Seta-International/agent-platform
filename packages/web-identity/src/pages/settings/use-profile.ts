import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProfile, type ProfileDto } from '../../api/client.ts';

const PROFILE_KEY = ['identity', 'me', 'profile'] as const;

/**
 * Shared account-profile state for the Settings pages. Replaces the per-page
 * `useEffect`/`useState` fetch so a save in one section (which returns a fresh
 * `ProfileDto`) refreshes every other section through the query cache.
 */
export function useProfile() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: PROFILE_KEY, queryFn: fetchProfile });
  const setProfile = (next: ProfileDto) => qc.setQueryData(PROFILE_KEY, next);
  return { profile: query.data ?? null, isLoading: query.isLoading, setProfile };
}
