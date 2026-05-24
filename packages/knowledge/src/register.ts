import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, StreamHubBuilder } from '@seta/core';
import { knowledgeAgentTools } from './agent-tools.ts';
import * as schema from './backend/db/schema.ts';
import { KnowledgeStreamHub } from './backend/stream/hub.ts';
import { KNOWLEDGE_EVENTS } from './events.ts';
import { KNOWLEDGE_PERMISSIONS } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const buildKnowledgeStreamHub: StreamHubBuilder = () => {
  const hub = new KnowledgeStreamHub();
  return {
    start: () => hub.start(),
    stop: () => hub.stop(),
    hub,
  };
};

export function registerKnowledgeContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'knowledge',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: KNOWLEDGE_EVENTS,
    rbac: KNOWLEDGE_PERMISSIONS,
    agentTools: knowledgeAgentTools,
    stream: buildKnowledgeStreamHub,
  });
}
