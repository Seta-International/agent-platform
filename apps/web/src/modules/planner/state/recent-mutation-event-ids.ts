const RING_SIZE = 128;
let ring: string[] = [];

export function rememberEventId(id: string): void {
  if (ring.includes(id)) return;
  ring.push(id);
  if (ring.length > RING_SIZE) ring = ring.slice(-RING_SIZE);
}

export function isOwnEcho(id: string): boolean {
  return ring.includes(id);
}

export function __resetRingForTests(): void {
  ring = [];
}
