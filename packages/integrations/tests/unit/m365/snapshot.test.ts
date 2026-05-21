import type { Group } from '@microsoft/microsoft-graph-types';
import { describe, expect, it } from 'vitest';
import type { MemberRef } from '../../../src/m365/lww.ts';
import { snapshotFromGraph } from '../../../src/m365/snapshot.ts';

const members: MemberRef[] = [
  { entra_oid: 'aaa-111', role: 'owner' },
  { entra_oid: 'bbb-222', role: 'member' },
];

describe('snapshotFromGraph', () => {
  it('maps a full Graph payload to a SyncSnapshot', () => {
    const group: Group = {
      displayName: 'Engineering',
      description: 'Core team',
      visibility: 'Private',
      theme: 'teal',
    };
    expect(snapshotFromGraph(group, members)).toEqual({
      name: 'Engineering',
      description: 'Core team',
      visibility: 'private',
      theme: 'teal',
      members,
    });
  });

  it('displayName null → name is empty string', () => {
    const group: Group = { displayName: null };
    const snap = snapshotFromGraph(group, []);
    expect(snap.name).toBe('');
  });

  it('description undefined → description is null', () => {
    const group: Group = { displayName: 'X' };
    const snap = snapshotFromGraph(group, []);
    expect(snap.description).toBeNull();
  });

  it('visibility "Public" → "public"', () => {
    const group: Group = { displayName: 'X', visibility: 'Public' };
    const snap = snapshotFromGraph(group, []);
    expect(snap.visibility).toBe('public');
  });

  it('visibility "Private" → "private"', () => {
    const group: Group = { displayName: 'X', visibility: 'Private' };
    const snap = snapshotFromGraph(group, []);
    expect(snap.visibility).toBe('private');
  });

  it('visibility undefined → "private" (default)', () => {
    const group: Group = { displayName: 'X' };
    const snap = snapshotFromGraph(group, []);
    expect(snap.visibility).toBe('private');
  });

  it('theme "Teal" (capitalized) → "teal" (lowercased)', () => {
    const group: Group = { displayName: 'X', theme: 'Teal' };
    const snap = snapshotFromGraph(group, []);
    expect(snap.theme).toBe('teal');
  });

  it('theme undefined → "blue" (fallback)', () => {
    const group: Group = { displayName: 'X' };
    const snap = snapshotFromGraph(group, []);
    expect(snap.theme).toBe('blue');
  });

  it('unknown theme string → "blue" (fallback, not in known-themes set)', () => {
    const group: Group = { displayName: 'X', theme: 'midnight' };
    const snap = snapshotFromGraph(group, []);
    expect(snap.theme).toBe('blue');
  });

  it('members array passes through verbatim', () => {
    const group: Group = { displayName: 'X' };
    const snap = snapshotFromGraph(group, members);
    expect(snap.members).toBe(members);
  });
});
