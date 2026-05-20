import type pino from 'pino';
import type { EmitDomainEvent, OutboxStoreLike } from '../mailer.ts';
import { renderTemplate } from '../render.ts';
import type { ResolvedTransport } from '../resolve-transport.ts';
import { TransportError } from '../transports/types.ts';
import type { MailTemplateName, MailTemplateProps } from '../types.ts';

export interface MailerWorkerDeps {
  outboxStore: OutboxStoreLike;
  resolveTransport(tenantId: string): Promise<ResolvedTransport>;
  emit: EmitDomainEvent;
  log: pino.Logger;
}

export interface MailerSendPayload {
  outgoingEmailId: string;
  props: unknown;
  replyTo?: string;
}

export function createMailerSendTask(
  deps: MailerWorkerDeps,
): (payload: MailerSendPayload) => Promise<void> {
  return async (payload) => {
    const row = (await deps.outboxStore.findById(payload.outgoingEmailId)) as {
      id: string;
      tenantId: string;
      template: string;
      toAddress: string;
      status: string;
    } | null;
    if (!row) return;
    if (row.status === 'sent' || row.status === 'permanently_failed') return;

    const resolved = await deps.resolveTransport(row.tenantId);
    const rendered = await renderTemplate(
      row.template as MailTemplateName,
      payload.props as MailTemplateProps[MailTemplateName],
    );
    try {
      const result = await resolved.transport.send({
        from: resolved.sender,
        fromDisplayName: resolved.senderDisplayName,
        to: row.toAddress,
        replyTo: payload.replyTo,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      await deps.outboxStore.markSent(row.id, {
        transportKind: resolved.transportKind,
        transportMessageId: result.messageId,
      });
      await deps.emit({
        tenantId: row.tenantId,
        aggregateType: 'outgoing_email',
        aggregateId: row.id,
        eventType: 'core.email.sent',
        eventVersion: 1,
        payload: {
          transport_kind: resolved.transportKind,
          transport_message_id: result.messageId,
          attempts: 1,
        },
      });
      deps.log.info(
        {
          outgoingEmailId: row.id,
          transportKind: resolved.transportKind,
          transportMessageId: result.messageId,
        },
        'mailer.send.succeeded',
      );
    } catch (err) {
      if (err instanceof TransportError && err.classification === 'permanent') {
        await deps.outboxStore.markPermanentlyFailed(row.id, {
          transportKind: resolved.transportKind,
          errorCode: err.code,
          error: err.message,
        });
        await deps.emit({
          tenantId: row.tenantId,
          aggregateType: 'outgoing_email',
          aggregateId: row.id,
          eventType: 'core.email.permanently_failed',
          eventVersion: 1,
          payload: {
            transport_kind: resolved.transportKind,
            error_code: err.code,
            attempts: 1,
          },
        });
        deps.log.error(
          { outgoingEmailId: row.id, error_code: err.code, error: err.message },
          'mailer.send.failed_permanent',
        );
        return;
      }
      const transientCode = err instanceof TransportError ? err.code : 'UNKNOWN';
      const transientMsg = err instanceof Error ? err.message : String(err);
      await deps.outboxStore.markFailedTransient(row.id, {
        transportKind: resolved.transportKind,
        error: transientMsg,
      });
      deps.log.warn(
        { outgoingEmailId: row.id, error_code: transientCode, error: transientMsg },
        'mailer.send.transient_retry',
      );
      throw err;
    }
  };
}
