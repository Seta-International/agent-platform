import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),
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
  M365_WEBHOOK_SECRET: z.string().min(32).optional(),
  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  KNOWLEDGE_AV_REQUIRED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((s) => s === 'true'),
});

export function parseEnv(raw: NodeJS.ProcessEnv): WorkerEnv {
  return Env.parse(raw);
}

export type WorkerEnv = z.infer<typeof Env>;
