export function computeAssigneeReorder(
  userIds: string[],
  sourceIndex: number,
  destinationIndex: number,
): string[] | null {
  if (sourceIndex === destinationIndex) return null;
  const next = [...userIds];
  const [moved] = next.splice(sourceIndex, 1);
  if (!moved) return null;
  next.splice(destinationIndex, 0, moved);
  return next;
}
