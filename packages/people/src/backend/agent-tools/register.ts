import { AgentRegistry } from '@seta/agent-sdk';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { resolveEmbeddingProvider } from '@seta/shared-embeddings';
import { resolveReranker } from '@seta/shared-retrieval';
import { peopleGetAvailabilitySpec } from './get-availability-for-user.ts';
import { peopleGetTimezoneSpec } from './get-timezone-for-user.ts';
import { matchUsersToTopicTool } from './match-users-by-topic.ts';
import { buildSearchUsersBySkillExactSpec } from './search-users-by-skill-exact.ts';
import { buildSearchUsersBySkillVectorSpec } from './search-users-by-skill-vector.ts';

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
  if (!url) throw new Error('DATABASE_URL required for people semantic search');
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
  id: 'people',
  description:
    'Finds people by skill or topic using semantic search across the workforce directory. Read-only.',
  instructions: () =>
    'You answer "who knows about X?" questions over the workforce.\n\n' +
    'people_matchUsersByTopic — find users by skill topic (semantic search, tenant-wide).\n' +
    '  Use for: "who knows about Kubernetes?", "find people with ML expertise".\n' +
    '  Do NOT use for exact skill-tag matching within a group — use ' +
    'planner_searchGroupMembersBySkills for that.\n\n' +
    'Never modify state.',
  tools: {
    people_matchUsersByTopic: matchUsersToTopic,
  },
});

AgentRegistry.registerCrossModuleReadTool(peopleGetAvailabilitySpec);
AgentRegistry.registerCrossModuleReadTool(peopleGetTimezoneSpec);
AgentRegistry.registerCrossModuleReadTool(buildSearchUsersBySkillExactSpec());
AgentRegistry.registerCrossModuleReadTool(
  buildSearchUsersBySkillVectorSpec({
    provider: lazyProvider,
    get databaseUrl(): string {
      return readDatabaseUrl();
    },
  }),
);
