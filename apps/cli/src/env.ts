import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().url(),
  EVENTS_RETENTION_DAYS: z.coerce.number().default(30),
  CRYPTO_KEY_PROVIDER: z.enum(['kms', 'env']).default('env'),
  CRYPTO_KMS_KEY_ARN: z.string().optional(),
  AWS_REGION: z.string().optional(),
  CRYPTO_LOCAL_KEYS: z.string().optional(),
  CRYPTO_LOCAL_PRIMARY_KID: z.string().optional(),
  CRYPTO_LOCAL_MASTER_KEY: z.string().optional(),
  MAILER_DEFAULT_TRANSPORT: z.enum(['smtp', 'dev-stub']).default('dev-stub'),
  MAILER_DEFAULT_SENDER: z.string().email().default('noreply@seta.example'),
  MAILER_DEFAULT_SENDER_DISPLAY_NAME: z.string().optional(),
  MAILER_DEFAULT_SMTP_URL: z.string().url().optional(),
  MAILER_GRAPH_CLIENT_ID: z.string().optional(),
  MAILER_GRAPH_CLIENT_SECRET: z.string().optional(),
});

export function parseEnv(raw: NodeJS.ProcessEnv) {
  return Env.parse(raw);
}
