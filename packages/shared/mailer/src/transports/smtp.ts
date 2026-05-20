import nodemailer, { type Transporter } from 'nodemailer';
import {
  type Transport,
  TransportError,
  type TransportSendInput,
  type TransportSendResult,
} from './types.ts';

export interface SmtpTransportOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  requireTls: boolean;
}

export function createSmtpTransport(opts: SmtpTransportOptions): Transport {
  const transporter = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.port === 465,
    requireTLS: opts.requireTls && opts.port !== 465,
    auth: opts.username || opts.password ? { user: opts.username, pass: opts.password } : undefined,
  });
  return createSmtpTransportFromTransporter(transporter);
}

export function createSmtpTransportFromUrl(url: string): Transport {
  const transporter = nodemailer.createTransport(url);
  return createSmtpTransportFromTransporter(transporter);
}

const PERMANENT_SMTP_CODES = new Set([550, 551, 553, 554, 535]);
const PERMANENT_NODEMAILER_CODES = new Set(['EAUTH', 'EENVELOPE']);
const TRANSIENT_NODEMAILER_CODES = new Set([
  'ECONNECTION',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
]);

export function createSmtpTransportFromTransporter(transporter: Transporter): Transport {
  return {
    kind: 'smtp',
    async send(input: TransportSendInput): Promise<TransportSendResult> {
      try {
        const info = await transporter.sendMail({
          from: input.fromDisplayName
            ? { name: input.fromDisplayName, address: input.from }
            : input.from,
          to: input.to,
          replyTo: input.replyTo,
          subject: input.subject,
          html: input.html,
          text: input.text,
        });
        return { messageId: info.messageId ?? null };
      } catch (err) {
        const e = err as Error & { responseCode?: number; code?: string };
        const code = e.code ?? (e.responseCode ? `SMTP_${e.responseCode}` : 'SMTP_UNKNOWN');
        const isPermanent =
          (e.responseCode !== undefined && PERMANENT_SMTP_CODES.has(e.responseCode)) ||
          (e.code !== undefined && PERMANENT_NODEMAILER_CODES.has(e.code));
        const isTransient = e.code !== undefined && TRANSIENT_NODEMAILER_CODES.has(e.code);
        throw new TransportError(
          'smtp',
          isPermanent ? 'permanent' : isTransient ? 'transient' : 'transient',
          code,
          e.message,
          err,
        );
      }
    },
  };
}
