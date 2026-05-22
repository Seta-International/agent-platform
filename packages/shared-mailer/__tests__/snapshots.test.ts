import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../src/render.ts';
import { previewProps as testSendPreview } from '../src/templates/_test-send/preview-props.ts';
import { previewProps as alertPreview } from '../src/templates/failed-login-alert/preview-props.ts';
import { previewProps as invitePreview } from '../src/templates/invite/preview-props.ts';
import { previewProps as resetPreview } from '../src/templates/password-reset/preview-props.ts';
import { previewProps as verifyPreview } from '../src/templates/verify-email/preview-props.ts';

const cases = [
  ['invite', invitePreview],
  ['verify-email', verifyPreview],
  ['password-reset', resetPreview],
  ['failed-login-alert', alertPreview],
  ['_test-send', testSendPreview],
] as const;

describe('template snapshots', () => {
  it.each(cases)('%s html', async (name, props) => {
    const out = await renderTemplate(name as never, props as never);
    expect(out.html).toMatchSnapshot();
  });

  it.each(cases)('%s text', async (name, props) => {
    const out = await renderTemplate(name as never, props as never);
    expect(out.text).toMatchSnapshot();
  });
});
