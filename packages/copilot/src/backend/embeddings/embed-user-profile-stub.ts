export interface EmbedUserProfilePayload {
  tenant_id: string;
  user_id: string;
  event_id: string;
}

/**
 * No-op user-profile-embedding handler. Real handler replaces this file in M3.3.
 */
export const embedUserProfileStub = async (
  _payload: EmbedUserProfilePayload,
  _helpers: never,
): Promise<void> => {};
