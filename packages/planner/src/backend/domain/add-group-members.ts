// rbac: delegates — every iteration calls addGroupMember(), which enforces
// planner.group.member.write via requirePermission(session, ...).
import type { PlannerSessionScope } from './_actor.ts';
import { addGroupMember } from './add-group-member.ts';

export async function addGroupMembers(input: {
  group_id: string;
  members: { user_id: string }[];
  session: PlannerSessionScope;
}): Promise<void> {
  for (const m of input.members) {
    await addGroupMember({
      group_id: input.group_id,
      user_id: m.user_id,
      session: input.session,
    });
  }
}
