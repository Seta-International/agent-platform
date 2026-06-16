const KEY = (userId: string) => `seta:last-app:${userId}`;
// Fixed fallback order (spec §5.1).
const ORDER = ['planner', 'agent', 'admin'] as const;

export function writeLastApp(userId: string, appId: string): void {
  try {
    localStorage.setItem(KEY(userId), appId);
  } catch {
    /* ignore */
  }
}
export function readLastApp(userId: string): string | undefined {
  try {
    return localStorage.getItem(KEY(userId)) ?? undefined;
  } catch {
    return undefined;
  }
}
export function clearLastApp(userId: string): void {
  try {
    localStorage.removeItem(KEY(userId));
  } catch {
    /* ignore */
  }
}
/** Returns the landing path (e.g. '/agent') or undefined if no app is permitted. */
export function resolveLanding(userId: string, permittedAppIds: string[]): string | undefined {
  const permitted = new Set(permittedAppIds);
  const last = readLastApp(userId);
  if (last && permitted.has(last)) return `/${last}`;
  const fallback = ORDER.find((id) => permitted.has(id)) ?? permittedAppIds[0];
  return fallback ? `/${fallback}` : undefined;
}
