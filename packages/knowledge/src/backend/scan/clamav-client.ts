import { Socket } from 'node:net';

const CHUNK_SIZE = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

export interface ClamavOpts {
  host: string;
  port: number;
  timeoutMs?: number;
}

export type ClamavResult = { status: 'clean' } | { status: 'infected'; virus: string };

/**
 * Stream bytes to clamd via the INSTREAM protocol. clamd replies with
 * `stream: OK` for clean, `stream: <name> FOUND` for an infection, or an
 * error string. The stream is framed as length-prefixed chunks terminated
 * by a zero-length frame.
 */
export async function scanStream(
  stream: AsyncIterable<Buffer>,
  opts: ClamavOpts,
): Promise<ClamavResult> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const buf: Buffer[] = [];
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('clamav timeout'));
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    socket.connect(opts.port, opts.host, async () => {
      socket.write('zINSTREAM\0');
      try {
        for await (const chunk of stream) {
          for (let i = 0; i < chunk.length; i += CHUNK_SIZE) {
            const part = chunk.subarray(i, i + CHUNK_SIZE);
            const lenBuf = Buffer.alloc(4);
            lenBuf.writeUInt32BE(part.length, 0);
            socket.write(lenBuf);
            socket.write(part);
          }
        }
        // Zero-length frame terminates INSTREAM.
        socket.write(Buffer.alloc(4));
      } catch (err) {
        clearTimeout(timeout);
        socket.destroy();
        reject(err);
      }
    });

    socket.on('data', (d: Buffer | string) => {
      buf.push(typeof d === 'string' ? Buffer.from(d) : d);
    });
    socket.on('end', () => {
      clearTimeout(timeout);
      const reply = Buffer.concat(buf).toString('utf8').replace(/\0$/, '').trim();
      if (/\bOK\b/.test(reply)) return resolve({ status: 'clean' });
      const found = reply.match(/:\s+(.+?)\s+FOUND/);
      if (found) return resolve({ status: 'infected', virus: found[1] ?? 'UNKNOWN' });
      reject(new Error(`unexpected clamd reply: ${reply}`));
    });
    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
