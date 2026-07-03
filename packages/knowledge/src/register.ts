import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry, StreamHubBuilder } from '@seta/core';
import { getLifecycleEntries, registerLifecycle } from '@seta/shared-db';
import { knowledgeAgentTools } from './agent-tools.ts';
import * as schema from './backend/db/schema.ts';
import { KnowledgeStreamHub } from './backend/stream/hub.ts';
import { KNOWLEDGE_EVENTS } from './events.ts';
import { knowledgeRbac } from './rbac.ts';

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
  // Tests construct a fresh ContributionRegistry per call (often several times per process),
  // but the shared-db lifecycle registry is process-global and throws on re-registering a
  // table — skip if a prior call in this process already ran.
  if (!getLifecycleEntries().some((e) => e.table === 'knowledge.files')) {
    registerLifecycle([
      { table: 'knowledge.files', policy: { kind: 'permanent' } },
      // Chat-attachment files/chunks are cleaned up by the chat-attachment-delete job on
      // thread deletion — that's a business rule (attachments belong to a thread), not a
      // retention policy, so both tables stay permanent here.
      { table: 'knowledge.chunks', policy: { kind: 'permanent' } },
    ]);
  }

  reg.module({
    name: 'knowledge',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: KNOWLEDGE_EVENTS,
    rbac: knowledgeRbac,
    agentTools: knowledgeAgentTools,
    stream: buildKnowledgeStreamHub,
  });
}
