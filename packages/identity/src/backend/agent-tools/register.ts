import { AgentRegistry } from '@seta/agent-sdk';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { resolveEmbeddingProvider } from '@seta/shared-embeddings';
import { resolveReranker } from '@seta/shared-retrieval';
import { identityGetAvailabilitySpec } from './get-availability-for-user.ts';
import { identityGetTimezoneSpec } from './get-timezone-for-user.ts';
import { listMyRolesTool } from './list-my-roles.ts';
import { matchUsersToTopicTool } from './match-users-to-topic.ts';
import { buildSearchUsersBySkillVectorSpec } from './search-users-by-skill-vector.ts';
import { updateMyDisplayNameTool } from './update-my-display-name.ts';
import { whoAmITool } from './who-am-i.ts';

// Lazy so a missing EMBED config doesn't break module load — only first use.
const lazyProvider: EmbeddingProvider = {
  get modelId() {
    return resolveEmbeddingProvider().modelId;
  },
  get dimensions() {
    return resolveEmbeddingProvider().dimensions;
  },
  embed: (texts) => resolveEmbeddingProvider().embed(texts),
};

function readDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required for identity semantic search');
  return url;
}

const matchUsersToTopic = matchUsersToTopicTool({
  provider: lazyProvider,
  reranker: resolveReranker(),
  get databaseUrl(): string {
    return readDatabaseUrl();
  },
});

AgentRegistry.registerSpecialist({
  domain: 'people',
  id: 'identity',
  description: 'Looks up users, roles, and finds people by topic. Read-only across the directory.',
  instructions: () =>
    'You answer who-is-who questions.\n\n' +
    "identity_whoAmI — read the calling user's own profile.\n" +
    'identity_listMyRoles — list effective permissions of the calling user.\n' +
    'identity_matchUsersByTopic — find users by skill topic (semantic search, tenant-wide).\n' +
    '  Use for: "who knows about Kubernetes?", "find people with ML expertise".\n' +
    '  Do NOT use for exact skill-tag matching within a group — use ' +
    'planner_searchGroupMembersBySkills for that.\n\n' +
    'Never modify state — defer self-modifications to the self specialist.',
  tools: {
    identity_whoAmI: whoAmITool,
    identity_listMyRoles: listMyRolesTool,
    identity_matchUsersByTopic: matchUsersToTopic,
  },
});

AgentRegistry.registerSpecialist({
  domain: 'self',
  id: 'self',
  description: "Manages the current user's profile, preferences, and notifications.",
  instructions: () =>
    'You manage the current user. Use identity_whoAmI to read profile, ' +
    'identity_updateMyDisplayName to rename — it surfaces a one-click approval card. ' +
    'Call write tools directly when the user states intent; do NOT ask for ' +
    'confirmation in chat first, the framework handles approval via the card.',
  tools: {
    identity_whoAmI: whoAmITool,
    identity_updateMyDisplayName: updateMyDisplayNameTool,
  },
});

AgentRegistry.registerCrossModuleReadTool(
  buildSearchUsersBySkillVectorSpec({
    provider: lazyProvider,
    get databaseUrl(): string {
      return readDatabaseUrl();
    },
  }),
);
AgentRegistry.registerCrossModuleReadTool(identityGetTimezoneSpec);
AgentRegistry.registerCrossModuleReadTool(identityGetAvailabilitySpec);
