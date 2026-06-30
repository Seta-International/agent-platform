export type ProductId = 'people' | 'pm' | 'hiring' | 'planner';

export const PRODUCTS = [
  { id: 'people', label: 'People', namespace: 'people' },
  { id: 'pm', label: 'Project Monitoring', namespace: 'pm' },
  { id: 'hiring', label: 'Hiring', namespace: 'hiring' },
  { id: 'planner', label: 'Planner', namespace: 'planner' },
] as const satisfies ReadonlyArray<{ id: ProductId; label: string; namespace: string }>;

export const PRODUCT_IDS: ReadonlyArray<ProductId> = PRODUCTS.map((p) => p.id);
export const PRODUCT_NAMESPACES: ReadonlySet<string> = new Set(PRODUCTS.map((p) => p.namespace));
export const PRODUCT_GATE_EXEMPT: ReadonlySet<string> = new Set([
  'people.self.read',
  'people.self.manage',
]);

const byNamespace = new Map(PRODUCTS.map((p) => [p.namespace, p.id]));
export function productForNamespace(ns: string): ProductId | undefined {
  return byNamespace.get(ns);
}
