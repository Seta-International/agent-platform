import { describe, expect, it } from 'vitest';
import { generateWorkEmail, slugLocalPart } from '../../src/backend/domain/work-email.ts';

describe('work-email', () => {
  it('slugifies a full name to first.last', () => {
    expect(slugLocalPart('Nguyễn Văn A')).toBe('nguyen.van.a');
    expect(slugLocalPart('  Jane   Doe ')).toBe('jane.doe');
  });
  it('appends a numeric suffix on collision', async () => {
    const taken = new Set(['jane.doe@acme.com']);
    const email = await generateWorkEmail('Jane Doe', 'acme.com', async (e) => taken.has(e));
    expect(email).toBe('jane.doe2@acme.com');
  });
});
