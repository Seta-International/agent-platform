import { describe, expect, it } from 'vitest';
import { IntegrationsError } from '../../src/backend/rbac.ts';
import { integrationsErrorMapper } from '../../src/register.ts';

describe('integrationsErrorMapper (FUT-4)', () => {
  it('maps FORBIDDEN to 403', () => {
    const mapped = integrationsErrorMapper(
      new IntegrationsError('FORBIDDEN', 'missing permission integrations.mail.configure'),
    );
    expect(mapped).toEqual({
      status: 403,
      body: {
        error: 'FORBIDDEN',
        message: 'missing permission integrations.mail.configure',
      },
    });
  });

  it('maps NOT_FOUND to 404', () => {
    const mapped = integrationsErrorMapper(new IntegrationsError('NOT_FOUND', 'no config'));
    expect(mapped?.status).toBe(404);
  });

  it('maps INVALID_INPUT to 400', () => {
    const mapped = integrationsErrorMapper(new IntegrationsError('INVALID_INPUT', 'bad input'));
    expect(mapped?.status).toBe(400);
  });

  it('maps TRANSPORT_VERIFY_FAILED to 422', () => {
    const mapped = integrationsErrorMapper(
      new IntegrationsError('TRANSPORT_VERIFY_FAILED', 'smtp auth failed'),
    );
    expect(mapped?.status).toBe(422);
  });

  it('returns null for errors from other modules, so the global handler falls through', () => {
    expect(integrationsErrorMapper(new Error('unrelated'))).toBeNull();
  });
});
