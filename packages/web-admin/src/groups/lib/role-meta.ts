import { INVENTORY, type ProductId, productForNamespace } from '@seta/shared-rbac';

export interface RoleMeta {
  slug: string;
  module: string;
  label: string;
  description: string;
  product?: ProductId;
}

const FOUNDATION_META: Record<string, { module: string; description: string }> = {
  'org.admin': { module: 'org', description: 'Full administration of this workspace' },
  'org.viewer': { module: 'org', description: 'Read-only across the workspace' },
};

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Short, friendly names for the role namespace. Falls back to title-case.
const MODULE_DISPLAY: Record<string, string> = {
  org: 'Org',
  people: 'People',
  pm: 'PM',
  hiring: 'Hiring',
  planner: 'Planner',
  agent: 'Agent',
  core: 'Core',
  knowledge: 'Knowledge',
  notifications: 'Notifications',
  integrations: 'Integrations',
  staffing: 'Staffing',
  identity: 'Identity',
};

export function moduleDisplay(module: string): string {
  return MODULE_DISPLAY[module] ?? titleCase(module);
}

/** Role name without its module prefix: `hiring.recruiter` → "Recruiter". */
export function roleTail(slug: string): string {
  const tail = slug.split('.').slice(1).map(titleCase).join(' ');
  return tail || titleCase(slug);
}

/**
 * Human label for a role slug, qualified by its module so labels stay unique:
 * `people.viewer` → "People · Viewer" (not just "Viewer", which collides with
 * every other module's viewer role).
 */
export function roleLabel(slug: string): string {
  const parts = slug.split('.');
  const module = parts[0] ?? slug;
  const tail = parts.slice(1).map(titleCase).join(' ');
  return tail ? `${moduleDisplay(module)} · ${tail}` : titleCase(slug);
}

const META = new Map<string, RoleMeta>();
for (const mod of INVENTORY) {
  for (const role of mod.roles) {
    META.set(role.slug, {
      slug: role.slug,
      module: mod.module,
      label: roleLabel(role.slug),
      description: role.description,
      product: productForNamespace(mod.module),
    });
  }
}
for (const [slug, meta] of Object.entries(FOUNDATION_META)) {
  if (!META.has(slug)) {
    META.set(slug, {
      slug,
      module: meta.module,
      label: roleLabel(slug),
      description: meta.description,
      product: productForNamespace(meta.module),
    });
  }
}

export function roleMeta(slug: string): RoleMeta {
  return (
    META.get(slug) ?? {
      slug,
      module: slug.split('.')[0] ?? slug,
      label: roleLabel(slug),
      description: '',
      product: productForNamespace(slug.split('.')[0] ?? ''),
    }
  );
}

/** Distinct products a set of roles confers, in PRODUCTS order. */
export function derivedProducts(slugs: readonly string[]): ProductId[] {
  const seen = new Set<ProductId>();
  for (const slug of slugs) {
    const p = roleMeta(slug).product;
    if (p) seen.add(p);
  }
  return [...seen];
}
