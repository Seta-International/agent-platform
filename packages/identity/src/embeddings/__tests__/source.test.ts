import { sourceHash } from '@seta/shared-embeddings';
import { describe, expect, it } from 'vitest';
import { buildUserProfileSource, type UserProfileSourceInput } from '../source.ts';

describe('buildUserProfileSource', () => {
  it('joins Name + Skills as labeled prose', () => {
    const input: UserProfileSourceInput = {
      name: 'Alice',
      skills: ['terraform', 'kubernetes'],
      availability_status: 'available',
    };
    expect(buildUserProfileSource(input)).toBe(
      'Name: Alice\nSkills: terraform, kubernetes\nAvailability: available',
    );
  });

  it('omits Skills when empty array', () => {
    const input: UserProfileSourceInput = {
      name: 'Bob',
      skills: [],
      availability_status: 'busy',
    };
    expect(buildUserProfileSource(input)).toBe('Name: Bob\nAvailability: busy');
  });

  it('hash-regression pin — known input produces known sha256', () => {
    const source = buildUserProfileSource({
      name: 'Alice',
      skills: ['terraform', 'kubernetes'],
      availability_status: 'available',
    });
    expect(sourceHash(source)).toBe(
      'dd1e89b242cb99042284114395b9997eaaa46e1e7390c89c56e201b87c5afa19',
    );
  });
});
