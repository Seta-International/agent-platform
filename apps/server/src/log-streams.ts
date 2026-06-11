import path from 'node:path';
import pino from 'pino';

/**
 * pino destinations for an app process: always stdout, plus an NDJSON file so
 * logs survive after the dev terminal scrolls away — what makes an agent turn
 * debuggable after the fact (tail/grep instead of DB archaeology).
 *
 * On by default outside production. Override the directory with LOG_DIR; turn
 * the file off with LOG_TO_FILE=false. Default dir is <repo>/logs (the app's
 * cwd under turbo dev is apps/<name>, so ../../logs resolves to the repo root).
 */
export function logStreams(name: string): pino.StreamEntry[] {
  const streams: pino.StreamEntry[] = [{ stream: process.stdout }];
  const wantFile =
    process.env.LOG_TO_FILE !== 'false' &&
    (process.env.LOG_DIR !== undefined || process.env.NODE_ENV !== 'production');
  if (wantFile) {
    const dir = process.env.LOG_DIR ?? path.resolve(process.cwd(), '../../logs');
    streams.push({
      stream: pino.destination({
        dest: path.join(dir, `${name}.log`),
        append: true,
        mkdir: true,
        sync: false,
      }),
    });
  }
  return streams;
}
