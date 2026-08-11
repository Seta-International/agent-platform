import { PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { putObject } from '../../src/put.ts';

describe('putObject', () => {
  it('issues a PutObjectCommand carrying the right Bucket/Key/Body/ContentType', async () => {
    const send = vi.fn(async () => ({}));
    const body = new Uint8Array([1, 2, 3]);

    await putObject(
      {
        bucket: 'b',
        key: 'tenants/t1/people-photo/p1/avatar.jpg',
        body,
        contentType: 'image/jpeg',
      },
      { client: { send } as never },
    );

    expect(send).toHaveBeenCalledOnce();
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'b',
      Key: 'tenants/t1/people-photo/p1/avatar.jpg',
      Body: body,
      ContentType: 'image/jpeg',
    });
  });
});
