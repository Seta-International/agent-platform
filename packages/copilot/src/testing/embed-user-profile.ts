/**
 * Re-exports the user-profile embedding utility for use in cross-package test suites.
 * Only import from test files — not production code.
 */
export {
  type EmbedUserProfileDeps,
  type EmbedUserProfilePayload,
  embedUserProfile,
} from '../backend/embeddings/embed-user-profile.ts';
