// Planner directive orderHint form per
// https://learn.microsoft.com/graph/api/resources/planner-order-hint-format —
// `<prev> <next>!` with empty string substituted when either endpoint is missing.
// The Graph service rewrites this into a canonical short hint on Prefer: return=representation.
//
// Intentional duplicate of m365Directive in @seta/planner's order-hint.ts.
// Cross-package util duplication preferred over exposing a private 3-line helper on the public surface.
export function directiveBetween(prev: string | null, next: string | null): string {
  return `${prev ?? ''} ${next ?? ''}!`;
}
