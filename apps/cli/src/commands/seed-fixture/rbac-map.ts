// Fixture primary_role -> extra persona group slugs (everyone also joins the base 'member' group).
export function personaGroupsFor(primaryRole: string): string[] {
  const r = primaryRole.toUpperCase();
  if (r === 'ADMIN') return ['admin']; // org.admin wildcard subsumes the old pm.pmo grant
  if (r === 'PM') return ['am']; // pm.strategic
  if (r === 'PRODUCT DIRECTOR') return ['bod'];
  if (r === 'DIRECTOR') return ['am']; // pm.strategic
  return []; // MARKETING + IC -> member only
}
