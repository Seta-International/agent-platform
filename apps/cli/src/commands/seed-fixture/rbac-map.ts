type Grant = { slug: string; scope_type: 'tenant'; scope_id: null };
const T = (slug: string): Grant => ({ slug, scope_type: 'tenant', scope_id: null });

const BASE_IC: Grant[] = [T('planner.contributor'), T('knowledge.member'), T('agent.contributor')];

export function rolesFor(primaryRole: string): Grant[] {
  const r = primaryRole.toUpperCase();
  // Admins double as the PMO governance gate (the fixture has no dedicated PMO role).
  if (r === 'ADMIN') return [T('org.admin'), T('pm.pmo')];
  if (r === 'PM') return [T('pm.strategic'), T('planner.contributor'), T('agent.contributor')];
  // The Product Director is the Board (final charter approval gate).
  if (r === 'PRODUCT DIRECTOR') return [T('pm.bod'), T('agent.contributor')];
  if (r === 'DIRECTOR') return [T('pm.strategic'), T('agent.contributor')];
  if (r === 'MARKETING') return [T('planner.viewer'), T('knowledge.member')];
  return BASE_IC;
}
