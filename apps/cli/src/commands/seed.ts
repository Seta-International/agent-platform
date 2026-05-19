import pino from 'pino';

const log = pino({ name: 'cli/seed' });

export async function seedCommand(): Promise<void> {
  log.info('seed: nothing to do at M1 (no feature modules)');
}
