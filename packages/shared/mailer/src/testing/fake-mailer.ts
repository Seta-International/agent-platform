import { randomUUID } from 'node:crypto';
import type { Mailer, MailTemplateName, SendInput, SendResult } from '../types.ts';

export interface FakeMailerSentItem {
  to: string;
  template: MailTemplateName;
  props: unknown;
  tenantId: string;
  dedupeKey: string;
}

export class FakeMailer implements Mailer {
  readonly sent: FakeMailerSentItem[] = [];

  async send<TName extends MailTemplateName>(input: SendInput<TName>): Promise<SendResult> {
    this.sent.push({
      to: input.to.toLowerCase(),
      template: input.template,
      props: input.props,
      tenantId: input.tenantId,
      dedupeKey: input.dedupeKey,
    });
    return { outgoingEmailId: randomUUID(), deduped: false };
  }

  reset(): void {
    this.sent.length = 0;
  }
}
