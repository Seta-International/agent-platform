type Grant = { slug: string; scope_type: 'tenant'; scope_id: null };
const T = (slug: string): Grant => ({ slug, scope_type: 'tenant', scope_id: null });

const BASE_IC: Grant[] = [T('planner.contributor'), T('knowledge.member'), T('agent.contributor')];

export function rolesFor(primaryRole: string): Grant[] {
  const r = primaryRole.toUpperCase();
  if (r === 'ADMIN') return [T('org.admin')];
  if (r === 'PM') return [T('pm.strategic'), T('planner.contributor'), T('agent.contributor')];
  if (r === 'DIRECTOR' || r === 'PRODUCT DIRECTOR')
    return [T('pm.strategic'), T('agent.contributor')];
  if (r === 'MARKETING') return [T('planner.viewer'), T('knowledge.member')];
  return BASE_IC;
}
