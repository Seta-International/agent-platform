import { describe, expect, it } from 'vitest';
import { listTemplates, renderTemplate } from '../src/render.ts';
import { previewProps as testSendPreview } from '../src/templates/_test-send/preview-props.ts';
import { previewProps as alertPreview } from '../src/templates/failed-login-alert/preview-props.ts';
import { previewProps as invitePreview } from '../src/templates/invite/preview-props.ts';
import { previewProps as resetPreview } from '../src/templates/password-reset/preview-props.ts';
import { previewProps as verifyPreview } from '../src/templates/verify-email/preview-props.ts';

describe('renderTemplate', () => {
  it('renders verify-email to HTML with subject and plain text', async () => {
    const out = await renderTemplate('verify-email', {
      displayName: 'Alex Lee',
      verifyUrl: 'https://app.seta.example/verify?token=abc',
      expiresAt: '2026-05-21 09:00 UTC',
    });
    expect(out.subject).toBe('Alex Lee, confirm your Seta email');
    expect(out.html).toContain('Confirm your email');
    expect(out.html).toContain('https://app.seta.example/verify?token=abc');
    expect(out.text).toContain('confirm your email');
    expect(out.text).not.toContain('<button');
  });
});

describe('all templates render', () => {
  it.each([
    ['invite', invitePreview, 'Acme: Sam Chen invited you to Seta'],
    ['verify-email', verifyPreview, 'Alex Lee, confirm your Seta email'],
    ['password-reset', resetPreview, 'Reset your Seta password'],
    ['failed-login-alert', alertPreview, 'Failed sign-in attempts on your Seta account'],
    ['_test-send', testSendPreview, 'Seta mail transport test'],
  ] as const)('%s', async (name, props, expectedSubject) => {
    const out = await renderTemplate(name as never, props as never);
    expect(out.subject).toBe(expectedSubject);
    expect(out.html).toContain('<html');
    expect(out.text.length).toBeGreaterThan(0);
  });

  it('listTemplates returns all 5 names', () => {
    expect(listTemplates()).toEqual(
      expect.arrayContaining([
        'invite',
        'verify-email',
        'password-reset',
        'failed-login-alert',
        '_test-send',
      ]),
    );
  });
});
