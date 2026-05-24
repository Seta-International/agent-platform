import type { SubscriberDef } from '@seta/shared-types';

// Deferred-construction slot for subscribers that need the live Mastra instance
// to do their work (e.g. starting workflow runs in response to domain events).
// `mastra` is typed as `unknown` to keep @mastra/core out of consumers'
// resolved type graph; orchestrator modules cast to `Mastra` at the call site.
//
// The copilot engine builds Mastra inside `registerCopilot`, then iterates
// `reg.collected.subscriberBuilders` and asks each one for its concrete
// `SubscriberDef`. The resulting subscribers are appended to the runtime's
// dispatcher subscription list alongside `reg.collected.subscribers`.
export interface SubscriberBuilderDeps {
  mastra: unknown;
}

export type SubscriberBuilder = (deps: SubscriberBuilderDeps) => SubscriberDef;
