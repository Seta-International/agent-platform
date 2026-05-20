// Mirrors identity's global-setup shape. No-op until Task 7 adds DB test fixtures.
export default async function (): Promise<() => Promise<void>> {
  return async () => {};
}
