import { sourceHash } from '@seta/shared-embeddings';
import { describe, expect, it } from 'vitest';
import { buildTaskSource, type TaskSourceInput } from '../../../src/backend/embeddings/source.ts';

describe('buildTaskSource', () => {
  it('joins Title + Description + Skills as labeled prose', () => {
    const input: TaskSourceInput = {
      title: 'Provision EKS cluster',
      description: 'Set up control plane and worker nodes for prod.',
      labels: ['terraform', 'kubernetes'],
    };
    expect(buildTaskSource(input)).toBe(
      'Title: Provision EKS cluster\n' +
        'Description: Set up control plane and worker nodes for prod.\n' +
        'Skills: terraform, kubernetes',
    );
  });

  it('omits Description when null', () => {
    expect(buildTaskSource({ title: 'X', description: null, labels: [] })).toBe('Title: X');
  });

  it('omits Description when empty string', () => {
    expect(buildTaskSource({ title: 'X', description: '', labels: [] })).toBe('Title: X');
  });

  it('omits Skills when empty array', () => {
    expect(buildTaskSource({ title: 'X', description: 'Y', labels: [] })).toBe(
      'Title: X\nDescription: Y',
    );
  });

  it('hash-regression pin — known input produces known sha256', () => {
    const source = buildTaskSource({
      title: 'Provision EKS cluster',
      description: 'Set up control plane and worker nodes for prod.',
      labels: ['terraform', 'kubernetes'],
    });
    expect(sourceHash(source)).toBe(
      'c2910c6abd42bf3735831925381db8a65a4f319d18c882fb466b6bf070bf443e',
    );
  });
});
