import type pino from 'pino';
import { z } from 'zod';
import type { MailerEnv } from './env.ts';
import { hashProps } from './props-hash.ts';
import { TEMPLATE_NAMES } from './template-names.ts';
import {
  type Mailer,
  MailerError,
  type MailTemplateName,
  type SendInput,
  type SendResult,
} from './types.ts';

export interface QueueHandle {
  addJob(
    taskName: string,
    payload: unknown,
    opts?: { jobKey?: string; maxAttempts?: number },
  ): Promise<void>;
}

export interface OutboxStoreLike {
  upsertPending(input: {
    tenantId: string;
    dedupeKey: string;
    template: string;
    toAddress: string;
    propsHash: string;
  }): Promise<{ id: string; deduped: boolean }>;
  findById(id: string): Promise<unknown>;
  markSent(
    id: string,
    fields: { transportKind: string; transportMessageId: string | null },
  ): Promise<void>;
  markFailedTransient(id: string, fields: { transportKind: string; error: string }): Promise<void>;
  markPermanentlyFailed(
    id: string,
    fields: { transportKind: string; errorCode: string; error: string },
  ): Promise<void>;
}

export type EmitDomainEvent = (event: {
  tenantId: string;
  aggregateType: 'outgoing_email';
  aggregateId: string;
  eventType: 'core.email.queued' | 'core.email.sent' | 'core.email.permanently_failed';
  eventVersion: 1;
  payload: Record<string, unknown>;
}) => Promise<void>;

export interface CreateMailerDeps {
  env: MailerEnv;
  outboxStore: OutboxStoreLike;
  queue: QueueHandle;
  emit: EmitDomainEvent;
  log: pino.Logger;
}

const sendInputSchema = z.object({
  to: z.email(),
  template: z.string(),
  props: z.unknown(),
  tenantId: z.string().min(1),
  dedupeKey: z.string().min(1).max(256),
  replyTo: z.email().optional(),
});

function redactEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0] ?? '*'}***@${domain}`;
}

export function createMailer(deps: CreateMailerDeps): Mailer {
  const validTemplates = new Set<string>(TEMPLATE_NAMES);
  return {
    async send<TName extends MailTemplateName>(input: SendInput<TName>): Promise<SendResult> {
      const parsed = sendInputSchema.parse(input);
      if (!validTemplates.has(parsed.template)) {
        throw new MailerError('TEMPLATE_RENDER_FAILED', `unknown template: ${parsed.template}`);
      }
      const toAddress = parsed.to.toLowerCase().trim();
      const propsHash = hashProps(parsed.props);
      const { id, deduped } = await deps.outboxStore.upsertPending({
        tenantId: parsed.tenantId,
        dedupeKey: parsed.dedupeKey,
        template: parsed.template,
        toAddress,
        propsHash,
      });
      await deps.emit({
        tenantId: parsed.tenantId,
        aggregateType: 'outgoing_email',
        aggregateId: id,
        eventType: 'core.email.queued',
        eventVersion: 1,
        payload: {
          template: parsed.template,
          to_redacted: redactEmail(toAddress),
          props_hash: propsHash,
          dedupe_key: parsed.dedupeKey,
          deduped,
        },
      });
      if (!deduped) {
        await deps.queue.addJob(
          'mailer:send',
          { outgoingEmailId: id, props: parsed.props, replyTo: parsed.replyTo },
          { jobKey: id, maxAttempts: 8 },
        );
      }
      deps.log.info(
        { outgoingEmailId: id, template: parsed.template, to: redactEmail(toAddress), deduped },
        'mailer.send.enqueued',
      );
      return { outgoingEmailId: id, deduped };
    },
  };
}
