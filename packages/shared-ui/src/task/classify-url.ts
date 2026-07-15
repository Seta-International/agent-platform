import type { ReferenceType } from './reference-row';

export interface ClassifiedReference {
  url: string;
  type: ReferenceType;
  alias: string;
  host: string;
}

/** True if `host` is exactly `domain` or a subdomain of it, compared by segments. */
export function isHostOf(host: string, domain: string): boolean {
  const h = host.split('.');
  const d = domain.split('.');
  if (h.length < d.length) return false;
  return d.every((seg, i) => seg === h[h.length - d.length + i]);
}

export function classifyUrl(raw: string): ClassifiedReference | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const path = u.pathname.toLowerCase();
  const ext = path.match(/\.(docx?|xlsx?|pptx?|vsdx?|one)$/)?.[1];
  let type: ReferenceType = 'web';
  if (ext?.startsWith('doc')) type = 'word';
  else if (ext?.startsWith('xls')) type = 'excel';
  else if (ext?.startsWith('ppt')) type = 'powerPoint';
  else if (ext?.startsWith('vsd')) type = 'visio';
  else if (ext === 'one') type = 'oneNote';
  else if (isHostOf(u.hostname, 'sharepoint.com')) type = 'sharePoint';
  const last = u.pathname.split('/').filter(Boolean).at(-1) ?? u.host;
  const alias = decodeURIComponent(last);
  return { url: raw, type, alias, host: u.host };
}
