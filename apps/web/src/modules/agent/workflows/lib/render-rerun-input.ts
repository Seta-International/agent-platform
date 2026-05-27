export function renderRerunInput(priorInputSummary: unknown): Record<string, unknown> {
  if (typeof priorInputSummary !== 'object' || priorInputSummary === null) return {};
  return { ...(priorInputSummary as Record<string, unknown>) };
}
