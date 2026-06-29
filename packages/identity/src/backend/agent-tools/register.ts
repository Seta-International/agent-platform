import { AgentRegistry } from '@seta/agent-sdk';
import { identityGetAvailabilitySpec } from './get-availability-for-user.ts';
import { identityGetTimezoneSpec } from './get-timezone-for-user.ts';
import { listMyRolesTool } from './list-my-roles.ts';
import { updateMyDisplayNameTool } from './update-my-display-name.ts';
import { whoAmITool } from './who-am-i.ts';

AgentRegistry.registerSpecialist({
  domain: 'people',
  id: 'identity',
  description: 'Looks up the calling user and their roles. Read-only.',
  instructions: () =>
    'You answer who-is-who questions.\n\n' +
    "identity_whoAmI — read the calling user's own profile.\n" +
    'identity_listMyRoles — list effective permissions of the calling user.\n' +
    'To find users by skill topic (semantic search), use people_matchUsersByTopic.\n\n' +
    'Never modify state — defer self-modifications to the self specialist.',
  tools: {
    identity_whoAmI: whoAmITool,
    identity_listMyRoles: listMyRolesTool,
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

AgentRegistry.registerCrossModuleReadTool(identityGetTimezoneSpec);
AgentRegistry.registerCrossModuleReadTool(identityGetAvailabilitySpec);
