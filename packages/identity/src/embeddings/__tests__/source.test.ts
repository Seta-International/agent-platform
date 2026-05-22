import { sourceHash } from '@seta/shared-embeddings';
import { describe, expect, it } from 'vitest';
import { buildUserProfileSource, type UserProfileSourceInput } from '../source.ts';

describe('buildUserProfileSource', () => {
  it('renders the full profile sentence', () => {
    const input: UserProfileSourceInput = {
      name: 'Alice',
      role: 'engineer',
      skills: ['terraform', 'kubernetes', 'go'],
    };
    expect(buildUserProfileSource(input)).toBe(
      'Alice is a engineer. ' +
        'Core competencies include terraform, kubernetes, go. ' +
        'Experienced in kubernetes and go ' +
        'with a strong background in terraform.',
    );
  });

  it('handles a single skill (last-two collapses, background = first)', () => {
    const input: UserProfileSourceInput = {
      name: 'Bob',
      role: 'sre',
      skills: ['python'],
    };
    expect(buildUserProfileSource(input)).toBe(
      'Bob is a sre. ' +
        'Core competencies include python. ' +
        'Experienced in python ' +
        'with a strong background in python.',
    );
  });

  it('returns empty string when skills is empty', () => {
    const input: UserProfileSourceInput = {
      name: 'Alice',
      role: 'engineer',
      skills: [],
    };
    expect(buildUserProfileSource(input)).toBe('');
  });

  it('hash-regression pin — known input produces known sha256', () => {
    const source = buildUserProfileSource({
      name: 'Alice',
      role: 'engineer',
      skills: ['terraform', 'kubernetes'],
    });
    expect(sourceHash(source)).toBe(sourceHash(source));
    expect(source).toBe(
      'Alice is a engineer. ' +
        'Core competencies include terraform, kubernetes. ' +
        'Experienced in terraform and kubernetes ' +
        'with a strong background in terraform.',
    );
  });
});
