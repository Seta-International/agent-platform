import { render } from '@react-email/render';
import { createElement, type JSX } from 'react';
import TestSend, { subject as testSendSubject } from './templates/_test-send/email.tsx';
import FailedLoginAlert, {
  subject as failedLoginAlertSubject,
} from './templates/failed-login-alert/email.tsx';
import Invite, { subject as inviteSubject } from './templates/invite/email.tsx';
import PasswordReset, {
  subject as passwordResetSubject,
} from './templates/password-reset/email.tsx';
import VerifyEmail, { subject as verifyEmailSubject } from './templates/verify-email/email.tsx';
import { MailerError, type MailTemplateName, type MailTemplateProps } from './types.ts';

type TemplateModule<TName extends MailTemplateName> = {
  default: (props: MailTemplateProps[TName]) => JSX.Element;
  subject: (props: MailTemplateProps[TName]) => string;
};

const TEMPLATES: { [K in MailTemplateName]: TemplateModule<K> } = {
  invite: { default: Invite, subject: inviteSubject },
  'verify-email': { default: VerifyEmail, subject: verifyEmailSubject },
  'password-reset': { default: PasswordReset, subject: passwordResetSubject },
  'failed-login-alert': { default: FailedLoginAlert, subject: failedLoginAlertSubject },
  '_test-send': { default: TestSend, subject: testSendSubject },
};

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

export async function renderTemplate<TName extends MailTemplateName>(
  name: TName,
  props: MailTemplateProps[TName],
): Promise<RenderedTemplate> {
  const mod = TEMPLATES[name];
  if (!mod) throw new MailerError('TEMPLATE_RENDER_FAILED', `unknown template: ${String(name)}`);
  try {
    const element = createElement(
      mod.default as (p: unknown) => JSX.Element,
      props as unknown as Record<string, unknown>,
    );
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    return { subject: mod.subject(props), html, text };
  } catch (err) {
    throw new MailerError('TEMPLATE_RENDER_FAILED', `failed to render ${String(name)}`, err);
  }
}

export function listTemplates(): readonly MailTemplateName[] {
  return Object.keys(TEMPLATES) as MailTemplateName[];
}
