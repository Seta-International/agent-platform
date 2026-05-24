import { CopilotRegistry } from '@seta/copilot-sdk';
import { metaListCapabilitiesTool } from './meta-list-capabilities.ts';

CopilotRegistry.registerSpecialist({
  domain: 'meta',
  id: 'meta',
  description: 'About this assistant: what it can do, which modules are wired up.',
  instructions: () =>
    "You explain the assistant's own capabilities. Use meta_listCapabilities to list what is wired up.",
  tools: { meta_listCapabilities: metaListCapabilitiesTool },
});
