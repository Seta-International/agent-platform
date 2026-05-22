import { randomBytes } from 'node:crypto';
import {
  DecryptCommand,
  DescribeKeyCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from '@aws-sdk/client-kms';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createKmsKeyProvider } from '../../src/providers/kms.ts';

const ARN = 'arn:aws:kms:us-east-1:000000000000:key/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

let kmsMock: ReturnType<typeof mockClient>;

beforeEach(() => {
  kmsMock = mockClient(KMSClient);
});
afterEach(() => {
  kmsMock.restore();
});

describe('KmsKeyProvider', () => {
  it('generateDataKey returns plaintext + wrapped from GenerateDataKey', async () => {
    const plaintext = randomBytes(32);
    const wrapped = randomBytes(112);
    kmsMock
      .on(GenerateDataKeyCommand)
      .resolves({ Plaintext: plaintext, CiphertextBlob: wrapped, KeyId: ARN });

    const provider = createKmsKeyProvider({
      keyArn: ARN,
      client: new KMSClient({ region: 'us-east-1' }),
    });
    const dk = await provider.generateDataKey();
    expect(dk.plaintext.equals(plaintext)).toBe(true);
    expect(dk.wrapped.equals(wrapped)).toBe(true);
    expect(dk.kid).toBe(`kms:${ARN}`);
  });

  it('unwrapDataKey calls Decrypt with explicit KeyId and returns plaintext', async () => {
    const plaintext = randomBytes(32);
    kmsMock.on(DecryptCommand).resolves({ Plaintext: plaintext, KeyId: ARN });

    const provider = createKmsKeyProvider({
      keyArn: ARN,
      client: new KMSClient({ region: 'us-east-1' }),
    });
    const out = await provider.unwrapDataKey(`kms:${ARN}`, Buffer.from('wrapped-bytes'));
    expect(out.equals(plaintext)).toBe(true);

    const call = kmsMock.commandCalls(DecryptCommand)[0]!;
    expect(call.args[0].input.KeyId).toBe(ARN);
  });

  it('unwrapDataKey throws UNKNOWN_KID when kid namespace is not kms:', async () => {
    const provider = createKmsKeyProvider({
      keyArn: ARN,
      client: new KMSClient({ region: 'us-east-1' }),
    });
    await expect(provider.unwrapDataKey('env:demo', Buffer.alloc(0))).rejects.toMatchObject({
      code: 'UNKNOWN_KID',
    });
  });

  it('maps IncorrectKeyException to UNKNOWN_KID', async () => {
    const err = Object.assign(new Error('wrong key'), { name: 'IncorrectKeyException' });
    kmsMock.on(DecryptCommand).rejects(err);
    const provider = createKmsKeyProvider({
      keyArn: ARN,
      client: new KMSClient({ region: 'us-east-1' }),
    });
    await expect(provider.unwrapDataKey(`kms:${ARN}`, Buffer.from('x'))).rejects.toMatchObject({
      code: 'UNKNOWN_KID',
    });
  });

  it('maps AccessDeniedException to KEY_PROVIDER_UNAVAILABLE', async () => {
    const err = Object.assign(new Error('denied'), { name: 'AccessDeniedException' });
    kmsMock.on(GenerateDataKeyCommand).rejects(err);
    const provider = createKmsKeyProvider({
      keyArn: ARN,
      client: new KMSClient({ region: 'us-east-1' }),
    });
    await expect(provider.generateDataKey()).rejects.toMatchObject({
      code: 'KEY_PROVIDER_UNAVAILABLE',
    });
  });

  it('maps ThrottlingException to KEY_PROVIDER_UNAVAILABLE', async () => {
    const err = Object.assign(new Error('throttled'), { name: 'ThrottlingException' });
    kmsMock.on(GenerateDataKeyCommand).rejects(err);
    const provider = createKmsKeyProvider({
      keyArn: ARN,
      client: new KMSClient({ region: 'us-east-1' }),
    });
    await expect(provider.generateDataKey()).rejects.toMatchObject({
      code: 'KEY_PROVIDER_UNAVAILABLE',
    });
  });

  it('selfTest succeeds when DescribeKey returns Enabled', async () => {
    kmsMock.on(DescribeKeyCommand).resolves({
      KeyMetadata: { KeyId: ARN, Arn: ARN, Enabled: true, KeyState: 'Enabled' },
    });
    const provider = createKmsKeyProvider({
      keyArn: ARN,
      client: new KMSClient({ region: 'us-east-1' }),
    });
    await expect(provider.selfTest()).resolves.toBeUndefined();
  });

  it('selfTest throws when DescribeKey returns Enabled=false', async () => {
    kmsMock.on(DescribeKeyCommand).resolves({
      KeyMetadata: { KeyId: ARN, Arn: ARN, Enabled: false, KeyState: 'Disabled' },
    });
    const provider = createKmsKeyProvider({
      keyArn: ARN,
      client: new KMSClient({ region: 'us-east-1' }),
    });
    await expect(provider.selfTest()).rejects.toMatchObject({
      code: 'KEY_PROVIDER_UNAVAILABLE',
    });
  });
});
