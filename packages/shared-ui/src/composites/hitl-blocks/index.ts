import type { ComponentType } from 'react';
import { CitationsBlock } from './citations-block';
import { ConfidenceBlock } from './confidence-block';
import { DiffBlock } from './diff-block';
import { EntityListBlock } from './entity-list-block';
import { KvTableBlock } from './kv-table-block';
import { MarkdownBlock } from './markdown-block';
import type { BlockProps } from './types';

export type { BlockProps, EntityRef } from './types';

export const blockRenderers: Record<string, ComponentType<BlockProps>> = {
  markdown: MarkdownBlock,
  // `text` shares markdown's `body` field — render it as prose rather than blank.
  text: MarkdownBlock,
  kvTable: KvTableBlock,
  entityList: EntityListBlock,
  confidence: ConfidenceBlock,
  citations: CitationsBlock,
  diff: DiffBlock,
};
