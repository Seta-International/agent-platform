export function slugLocalPart(fullName: string): string {
  const ascii = fullName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd');
  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.');
}

export async function generateWorkEmail(
  fullName: string,
  primaryDomain: string,
  isTaken: (email: string) => Promise<boolean>,
): Promise<string> {
  const local = slugLocalPart(fullName) || 'user';
  let candidate = `${local}@${primaryDomain}`;
  let n = 1;
  while (await isTaken(candidate)) {
    n += 1;
    candidate = `${local}${n}@${primaryDomain}`;
  }
  return candidate;
}
