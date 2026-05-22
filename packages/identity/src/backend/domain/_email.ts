export function isValidEmail(s: string): boolean {
  if (s.length === 0 || s.length > 254) return false;
  const at = s.indexOf('@');
  if (at <= 0 || at !== s.lastIndexOf('@')) return false;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (local.length === 0 || domain.length === 0) return false;
  for (let i = 0; i < local.length; i++) {
    const c = local.charCodeAt(i);
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) return false;
  }
  const dot = domain.lastIndexOf('.');
  if (dot <= 0 || dot >= domain.length - 1) return false;
  for (let i = 0; i < domain.length; i++) {
    const c = domain.charCodeAt(i);
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) return false;
  }
  return true;
}
