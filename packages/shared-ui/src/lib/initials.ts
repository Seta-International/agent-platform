export function initialsOf(name: string): string {
  const initials: string[] = [];
  for (const p of name.split(/\s+/)) {
    if (p && initials.length < 2) initials.push(p.charAt(0));
  }
  return initials.join('').toUpperCase();
}
