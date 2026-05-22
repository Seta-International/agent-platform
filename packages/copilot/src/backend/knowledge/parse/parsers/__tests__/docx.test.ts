import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { docxParser } from '../docx.ts';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

// Minimal valid DOCX (zip of Open XML) built with Node's zlib + manual zip format.
// Content: a single paragraph "Hello docx world".
const SMALL_DOCX_B64 =
  'UEsDBBQAAAAIAAAAAADMVIwQ4QAAAJwBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2QTU7DMBCFr2J5i2KHLhBCSbqAsgQW5QCWM0ks7BnLMw3h9iht6QIV1u/ne3rNdklRzVA4ELb61tRaAXrqA46tft8/V/d62zX7rwyslhSRWz2J5Adr2U+QHBvKgEuKA5XkhA2V0WbnP9wIdlPXd9YTCqBUsnbornmCwR2iqN0igCdsgchaPZ6MK6vVLucYvJNAaGfsf1GqM8EUiEcPTyHzzZKitlcJq/I34Jx7naGU0IN6c0VeXIJW208qve3JHxKgmP9rruykYQgeLvm1LRfywBxwTNFclOQC/uy3x7u7b1BLAwQUAAAACAAAAAAANlfe3KQAAAAYAQAACwAAAF9yZWxzLy5yZWxzjc+xCsIwFAXQXwlvN2kdRKRpFxG6Sv2AkLy2wSQvJFHr37s4WHFwvVzO5Tbd4h27Y8qWgoSaV8AwaDI2TBIuw2mzh65tzuhUsRTybGNmi3chS5hLiQchsp7Rq8wpYli8Gyl5VTKnNImo9FVNKLZVtRPp04C1yXojIfWmBjY8I/5j0zhajUfSN4+h/Jj4agAbVJqwSHhQMsK8Y754B6JtxOpi+wJQSwMEFAAAAAgAAAAAAD1YYjxvAAAAigAAABwAAAB3b3JkL19yZWxzL2RvY3VtZW50LnhtbC5yZWxzVczLDQIhEADQVsjcZdCDMQbY2xZgtACCIxD5hSGG8r3qK+DpbZUsPjQ4tWrgKBUIqr49Uw0GHvf9cIHN6htlN1OrHFNnsUqubCDO2a+I7CMVx7J1qqvkVxvFTZZtBOzOv10gPCl1xvF7gNX4l9ovUEsDBBQAAAAIAAAAAAB1MlPHmAAAAMgAAAARAAAAd29yZC9kb2N1bWVudC54bWxFzk0KwjAQBeCrhOxtqguR0p9d8QB6gJrENpCZCZNo4u0ldeHmezDwHtNPBbx4W46OcJDHppXCoibjcB3k/TYfLnIa+9wZ0i+wmEQBj7HLg9xSCp1SUW8WlthQsFjAP4lhSbEhXlUmNoFJ2xgdruDVqW3PChaHsk4+yHxqhgpX0ni13pMwpIvIxN70ql6rvBt2f031/2r8AlBLAQIUABQAAAAIAAAAAADMVIwQ4QAAAJwBAAATAAAAAAAAAAAAAAAAAAAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQAFAAAAAgAAAAAADZX3tykAAAAGAEAAAsAAAAAAAAAAAAAAAAAEgEAAF9yZWxzLy5yZWxzUEsBAhQAFAAAAAgAAAAAAD1YYjxvAAAAigAAABwAAAAAAAAAAAAAAAAA3wEAAHdvcmQvX3JlbHMvZG9jdW1lbnQueG1sLnJlbHNQSwECFAAUAAAACAAAAAAAdTJTx5gAAADIAAAAEQAAAAAAAAAAAAAAAACIAgAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAQABAADAQAATwMAAAAA';

beforeAll(() => {
  mkdirSync(FIXTURES, { recursive: true });
  writeFileSync(resolve(FIXTURES, 'small.docx'), Buffer.from(SMALL_DOCX_B64, 'base64'));
});

describe('docxParser', () => {
  it('extracts text as a single section (no native paging)', async () => {
    const buf = await readFile(resolve(FIXTURES, 'small.docx'));
    const doc = await docxParser.parse(buf);
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0]?.page_hint).toBeNull();
    expect(doc.sections[0]?.text.length).toBeGreaterThan(0);
  });
});
