export interface UserProductAccess {
  product_id: string;
  source: 'tenant' | 'role' | 'group' | 'user';
  effect: 'grant' | 'revoke';
}

export async function listUserProducts(userId: string): Promise<UserProductAccess[]> {
  const res = await fetch(`/api/identity/v1/groups/users/${userId}/products`, {
    credentials: 'include',
  });
  if (!res.ok)
    throw new Error(`/api/identity/v1/groups/users/${userId}/products failed: ${res.status}`);
  return ((await res.json()) as { products: UserProductAccess[] }).products;
}

export async function setUserProductOverride(
  userId: string,
  productId: string,
  effect: 'grant' | 'revoke',
): Promise<void> {
  const res = await fetch(`/api/identity/v1/groups/users/${userId}/products/${productId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ effect }),
  });
  if (!res.ok)
    throw new Error(
      `/api/identity/v1/groups/users/${userId}/products/${productId} failed: ${res.status}`,
    );
}

export async function clearUserProductOverride(userId: string, productId: string): Promise<void> {
  const res = await fetch(`/api/identity/v1/groups/users/${userId}/products/${productId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok)
    throw new Error(
      `/api/identity/v1/groups/users/${userId}/products/${productId} failed: ${res.status}`,
    );
}
