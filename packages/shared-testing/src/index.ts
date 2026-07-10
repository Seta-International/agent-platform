export { createAppRole } from './app-role.ts';
export {
  type ConstitutionOpts,
  collectViolations,
  OWNED_SCHEMAS,
  TENANT_ID_EXEMPT,
  type Violation,
} from './db-constitution.ts';
export { FakeEmbeddingProvider, type FakeEmbeddingProviderOptions } from './fakes/embedding.ts';
export { type EventBusLike, FakeEventBus } from './fakes/event-bus.ts';
export { FakeMailer, type MailerLike } from './fakes/mailer.ts';
export { fixtures, type TenantRow } from './fixtures.ts';
export {
  ensureTemplateDb,
  markAsTemplate,
  type PgContainerHandle,
  startPgContainer,
} from './pg-container.ts';
export { assertRlsCensus, type RlsCensusOpts } from './rls-census.ts';
export { type TestDbCtx, withTestDb } from './with-test-db.ts';
