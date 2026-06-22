import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCategory,
  listCategories,
  listSkills,
} from '../../../src/skills/api/skills-client.ts';

afterEach(() => vi.restoreAllMocks());

describe('skills-client', () => {
  it('lists categories from the identity admin route', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ categories: [{ id: 'c1', name: 'Frontend' }] }), {
        status: 200,
      }),
    );
    const cats = await listCategories();
    expect(cats).toEqual([{ id: 'c1', name: 'Frontend' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/identity/v1/skill-categories',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('POSTs a new category and returns the id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'c2' }), { status: 201 }),
    );
    expect(await createCategory({ name: 'Data' })).toEqual({ id: 'c2' });
  });

  it('passes categoryId when listing skills', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ skills: [] }), { status: 200 }));
    await listSkills('c1');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/identity/v1/skills?categoryId=c1',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});
