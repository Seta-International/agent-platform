import { sourceHash } from '@seta/shared-embeddings';
import { describe, expect, it } from 'vitest';
import { buildUserProfileSource, type UserProfileSourceInput } from '../source.ts';

describe('buildUserProfileSource', () => {
  it('joins skills as a comma-separated labeled line', () => {
    const input: UserProfileSourceInput = {
      skills: ['terraform', 'kubernetes'],
    };
    expect(buildUserProfileSource(input)).toBe('Skills: terraform, kubernetes');
  });

  it('returns empty string when skills is empty', () => {
    const input: UserProfileSourceInput = {
      skills: [],
    };
    expect(buildUserProfileSource(input)).toBe('');
  });

  it('hash-regression pin — known input produces known sha256', () => {
    const source = buildUserProfileSource({
      skills: ['terraform', 'kubernetes'],
    });
    expect(sourceHash(source)).toBe(
      '8e5f082b3e786fb0f1d9b57864de99552d6da32c8a79e4d8f9e5336502a58ea6',
    );
  });
});
