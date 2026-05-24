import { CopilotRegistry } from '@seta/copilot-sdk';
import { getPool } from '@seta/shared-db';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { OpenAIEmbeddingProvider } from '@seta/shared-embeddings';
import { resolveReranker } from '@seta/shared-retrieval';
import type { Pool } from 'pg';
import { listMyRolesTool } from './list-my-roles.ts';
import { matchUsersToTopicTool } from './match-users-to-topic.ts';
import { updateMyDisplayNameTool } from './update-my-display-name.ts';
import { whoAmITool } from './who-am-i.ts';

// Lazy proxy around OpenAIEmbeddingProvider: defers reading OPENAI_API_KEY
// until the first .embed() call so the module can be registered in test
// environments that don't set OPENAI_API_KEY.
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

// Lazy Pool proxy: defers getPool('worker') until the first query so the module
// can be imported at registration time before initPools() is called (e.g. in tests
// that only verify the registry, not the DB).
function makeLazyPool(): Pool {
  let inner: Pool | undefined;
  const get = (): Pool => (inner ??= getPool('worker'));
  return new Proxy({} as Pool, {
    get(_target, prop) {
      return (get() as never)[prop as keyof Pool];
    },
  });
}

// Build match_users_to_topic at module load with identity-owned deps.
// Both the embedding provider and pool are lazy so OPENAI_API_KEY and
// initPools() are only required when a semantic search actually executes,
// not at registration time.
const matchUsersToTopic = matchUsersToTopicTool({
  provider: makeLazyEmbeddingProvider(),
  pool: makeLazyPool(),
  reranker: resolveReranker(),
});

// People domain — read-only directory & lookup of others.
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

// Self domain — current user's own profile + preferences (writes with HITL).
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
