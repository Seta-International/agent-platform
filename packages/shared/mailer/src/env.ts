import { z } from 'zod';

export const mailerEnvSchema = z
  .object({
    MAILER_DEFAULT_TRANSPORT: z.enum(['smtp', 'dev-stub']),
    MAILER_DEFAULT_SENDER: z.email(),
    MAILER_DEFAULT_SENDER_DISPLAY_NAME: z.string().optional(),
    MAILER_DEFAULT_SMTP_URL: z.string().optional(),
    MAILER_GRAPH_CLIENT_ID: z.string().optional(),
    MAILER_GRAPH_CLIENT_SECRET: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.MAILER_DEFAULT_TRANSPORT === 'smtp' && !v.MAILER_DEFAULT_SMTP_URL) {
      ctx.addIssue({
        code: 'custom',
        message: 'MAILER_DEFAULT_SMTP_URL required when MAILER_DEFAULT_TRANSPORT=smtp',
        path: ['MAILER_DEFAULT_SMTP_URL'],
      });
    }
  });

export type MailerEnv = z.infer<typeof mailerEnvSchema>;

export function parseMailerEnv(source: NodeJS.ProcessEnv): MailerEnv {
  return mailerEnvSchema.parse(source);
}
