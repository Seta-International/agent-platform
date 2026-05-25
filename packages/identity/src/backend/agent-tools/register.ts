import { CopilotRegistry } from '@seta/copilot-sdk';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { OpenAIEmbeddingProvider } from '@seta/shared-embeddings';
import { resolveReranker } from '@seta/shared-retrieval';
import { identityGetAvailabilitySpec } from './get-availability-for-user.ts';
import { identityGetTimezoneSpec } from './get-timezone-for-user.ts';
import { listMyRolesTool } from './list-my-roles.ts';
import { matchUsersToTopicTool } from './match-users-to-topic.ts';
import { buildSearchUsersBySkillVectorSpec } from './search-users-by-skill-vector.ts';
import { updateMyDisplayNameTool } from './update-my-display-name.ts';
import { whoAmITool } from './who-am-i.ts';

function makeLazyEmbeddingProvider(): EmbeddingProvider {
  let inner: EmbeddingProvider | undefined;
  const get = (): EmbeddingProvider => {
    if (inner) return inner;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY required for identity semantic search');
    const model = (process.env.EMBED_MODEL ?? 'text-embedding-3-small') as
      | 'text-embedding-3-small'
      | 'text-embedding-3-large';
    inner = new OpenAIEmbeddingProvider({ apiKey, model });
    return inner;
  };
  return {
    get modelId() {
      return get().modelId;
    },
    get dimensions() {
      return get().dimensions;
    },
    embed: (...args) => get().embed(...args),
  };
}

const lazyProvider = makeLazyEmbeddingProvider();
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

CopilotRegistry.registerSpecialist({
  domain: 'people',
  id: 'identity',
  description: 'Looks up users, roles, and finds people by topic. Read-only across the directory.',
  instructions: () =>
    'You answer who-is-who questions. Use identity_whoAmI, identity_listMyRoles, ' +
    'and match_users_to_topic. Never modify state — defer self-modifications to the self specialist.',
  tools: {
    identity_whoAmI: whoAmITool,
    identity_listMyRoles: listMyRolesTool,
    match_users_to_topic: matchUsersToTopic,
  },
});

CopilotRegistry.registerSpecialist({
  domain: 'self',
  id: 'self',
  description: "Manages the current user's profile, preferences, and notifications.",
  instructions: () =>
    'You manage the current user. Use identity_whoAmI to read profile, ' +
    'identity_updateMyDisplayName (HITL) to rename. Always confirm before writes.',
  tools: {
    identity_whoAmI: whoAmITool,
    identity_updateMyDisplayName: updateMyDisplayNameTool,
  },
});

CopilotRegistry.registerCrossModuleReadTool(
  buildSearchUsersBySkillVectorSpec({
    provider: lazyProvider,
    get databaseUrl(): string {
      return readDatabaseUrl();
    },
  }),
);
CopilotRegistry.registerCrossModuleReadTool(identityGetTimezoneSpec);
CopilotRegistry.registerCrossModuleReadTool(identityGetAvailabilitySpec);
