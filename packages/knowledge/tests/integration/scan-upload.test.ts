import { Readable } from 'node:stream';
import { resetCoreDb } from '@seta/core/testing';
import { resetKnowledgeDb } from '@seta/knowledge/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { knowledgeDb } from '../../src/backend/db/client.ts';
import { files } from '../../src/backend/db/schema.ts';
import { requestKnowledgeUpload } from '../../src/backend/domain/upload-url.ts';
import { runScanUpload } from '../../src/backend/jobs/scan-upload.ts';
import { buildTestSession } from '../helpers/session.ts';

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

const CLAMAV_HOST = process.env.CLAMAV_HOST ?? 'localhost';
const CLAMAV_PORT = Number(process.env.CLAMAV_PORT ?? 3320); // compose.dev.yml port offset

const SHOULD_RUN_CLAMAV =
  process.env.CLAMAV_AVAILABLE === 'true' || process.env.CI_CLAMAV === 'true';

const withDb = <T>(fn: () => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
    },
    async ({ databaseUrl }) => {
      resetCoreDb();
      resetKnowledgeDb();
      initPools({ databaseUrl });
      try {
        return await fn();
      } finally {
        resetCoreDb();
        resetKnowledgeDb();
        await closePools();
      }
    },
  );

function buildFakeS3(body: Buffer) {
  const deleteFn = vi.fn(async () => ({}));
  return {
    deleteFn,
    s3: {
      send: vi.fn(async (cmd: { constructor: { name: string }; input: { Range?: string } }) => {
        const name = cmd.constructor.name;
        if (name === 'GetObjectCommand') {
          const range = cmd.input.Range;
          if (range) {
            // bytes=0-N
            const match = range.match(/bytes=0-(\d+)/);
            const end = match ? Number(match[1]) + 1 : body.length;
            return { Body: Readable.from([body.subarray(0, end)]) };
          }
          return { Body: Readable.from([body]) };
        }
        if (name === 'DeleteObjectCommand') return deleteFn();
        throw new Error(`unexpected S3 command ${name}`);
      }),
    },
  };
}

async function seedFile(tenantId: string): Promise<string> {
  const session = buildTestSession({ tenant_id: tenantId, roles: ['org.admin'] });
  const result = await requestKnowledgeUpload(
    {
      tenant_id: tenantId,
      uploaded_by: session.user_id,
      filename: 'doc.pdf',
      mime_type: 'application/pdf',
      size_bytes: 100,
    },
    {
      bucket: 'test',
      session,
      presign: (async () => 'https://s3/signed') as never,
    },
  );
  return result.file_id;
}

describe.runIf(SHOULD_RUN_CLAMAV)('scan-upload job (clamav available)', () => {
  it('marks an EICAR upload as infected and deletes the S3 object', () =>
    withDb(async () => {
      const tenantId = crypto.randomUUID();
      const fileId = await seedFile(tenantId);
      const fake = buildFakeS3(Buffer.from(EICAR));

      await runScanUpload(
        { tenant_id: tenantId, file_id: fileId, s3_key: 'test/eicar.txt' },
        {
          bucket: 'test',
          clamavHost: CLAMAV_HOST,
          clamavPort: CLAMAV_PORT,
          // biome-ignore lint/suspicious/noExplicitAny: minimal fake S3 client for tests
          s3: fake.s3 as any,
        },
      );

      const [row] = await knowledgeDb()
        .select()
        .from(files)
        .where(eq(files.id, BigInt(fileId)));
      expect(row?.scan_status).toBe('infected');
      expect(row?.scan_detail).toMatch(/av_hit:/);
      expect(fake.deleteFn).toHaveBeenCalledOnce();
    }));

  it('marks a real PDF as clean', () =>
    withDb(async () => {
      const tenantId = crypto.randomUUID();
      const fileId = await seedFile(tenantId);
      // %PDF-1.4 minimal header is enough for file-type to identify it as pdf and clamav to clear it.
      const pdf = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj <<>> endobj\n');
      const fake = buildFakeS3(pdf);

      await runScanUpload(
        { tenant_id: tenantId, file_id: fileId, s3_key: 'test/doc.pdf' },
        {
          bucket: 'test',
          clamavHost: CLAMAV_HOST,
          clamavPort: CLAMAV_PORT,
          // biome-ignore lint/suspicious/noExplicitAny: minimal fake S3 client for tests
          s3: fake.s3 as any,
        },
      );

      const [row] = await knowledgeDb()
        .select()
        .from(files)
        .where(eq(files.id, BigInt(fileId)));
      expect(row?.scan_status).toBe('clean');
      expect(row?.scan_at).toBeTruthy();
      expect(fake.deleteFn).not.toHaveBeenCalled();
    }));
});

describe('scan-upload content-type sniffing', () => {
  it('rejects an .exe disguised as .pdf via magic bytes (no clamav needed)', () =>
    withDb(async () => {
      const tenantId = crypto.randomUUID();
      const fileId = await seedFile(tenantId);
      // PE/COFF executable header (MZ) — file-type identifies as application/x-msdownload.
      const exe = Buffer.concat([
        Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]),
        Buffer.alloc(SNIFF_PAD),
      ]);
      const fake = buildFakeS3(exe);

      await runScanUpload(
        { tenant_id: tenantId, file_id: fileId, s3_key: 'test/evil.pdf' },
        {
          bucket: 'test',
          clamavHost: CLAMAV_HOST,
          clamavPort: CLAMAV_PORT,
          // biome-ignore lint/suspicious/noExplicitAny: minimal fake S3 client for tests
          s3: fake.s3 as any,
        },
      );

      const [row] = await knowledgeDb()
        .select()
        .from(files)
        .where(eq(files.id, BigInt(fileId)));
      expect(row?.scan_status).toBe('infected');
      expect(row?.scan_detail).toMatch(/content_type_spoof/);
      expect(fake.deleteFn).toHaveBeenCalledOnce();
    }));
});

const SNIFF_PAD = 4096;
