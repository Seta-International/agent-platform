// packages/planner/tests/fixtures/golden/run-manifest.ts
//
// Captures the per-run reproducibility manifest (design spec Part 4 §2). Static
// dataset fields come from dataset.json; volatile versions are passed in by the
// runner so a stored report can be audited/replayed.
import { readFileSync } from 'node:fs';

const DATASET_URL = new URL('./manifests/dataset.json', import.meta.url);

interface DatasetManifest {
  datasetVersion: string;
  seedChecksum: string;
  embedding: { modelVersion: string };
}

export interface RunManifestOverrides {
  agentVersion: string;
  promptVersion: string;
  productionModelVersion: string;
  judgeModelVersion: string;
  harnessVersion: string;
  toolSchemaVersion?: string;
}

export interface RunManifest extends RunManifestOverrides {
  datasetVersion: string;
  seedChecksum: string;
  embeddingModelVersion: string;
  capturedAt: string;
}

export function buildRunManifest(overrides: RunManifestOverrides): RunManifest {
  const ds = JSON.parse(readFileSync(DATASET_URL, 'utf8')) as DatasetManifest;
  return {
    ...overrides,
    datasetVersion: ds.datasetVersion,
    seedChecksum: ds.seedChecksum,
    embeddingModelVersion: ds.embedding.modelVersion,
    capturedAt: new Date().toISOString(),
  };
}
