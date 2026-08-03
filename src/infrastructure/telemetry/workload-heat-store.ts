/**
 * Workload heat persistence (SP-215, #115).
 *
 * Operator-local histogram persistence under `.pi-smart-router/` (already
 * gitignored) with a versioned, provenance-stamped artifact. The artifact is
 * also the export/import interchange format — copy the file to export, drop
 * an artifact at the path to import, delete the file (or call
 * `clearWorkloadHeatFile`) to clear. Privacy contract: heat keys are
 * requirement fingerprints (SHA-256 of rounded requirement vectors) or
 * operator cluster ids — never prompt text, messages, or tool arguments.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  WorkloadHeatArtifactSchema,
  WorkloadHeatMap,
  type HeatProvenance,
  type WorkloadHeatArtifact,
} from '../../domain/routing/workload-heat.js';
import { DATASET_STATE_DIR } from './dataset-recorder.js';

export const WORKLOAD_HEAT_FILENAME = 'workload-heat.json';

export function getWorkloadHeatPath(cwd: string = process.cwd()): string {
  return join(cwd, DATASET_STATE_DIR, WORKLOAD_HEAT_FILENAME);
}

/**
 * Load the persisted histogram, or an empty map when the file is missing or
 * malformed (fail open with a warning — heat is a soft bias, never a gate).
 */
export function loadWorkloadHeatMap(
  cwd: string = process.cwd(),
  options?: { readonly maxEntries?: number },
): WorkloadHeatMap {
  const path = getWorkloadHeatPath(cwd);
  if (!existsSync(path)) {
    return new WorkloadHeatMap(options);
  }

  try {
    const raw = readFileSync(path, 'utf8');
    return WorkloadHeatMap.importArtifact(JSON.parse(raw), options);
  } catch (error) {
    console.warn('Failed to load workload heat artifact; starting cold', {
      path,
      error,
    });
    return new WorkloadHeatMap(options);
  }
}

/**
 * Persist the histogram with provenance. Creates `.pi-smart-router/` when
 * needed. Write failures propagate (fail loud — the caller decides).
 */
export function saveWorkloadHeatMap(
  map: WorkloadHeatMap,
  cwd: string = process.cwd(),
  provenance?: Partial<HeatProvenance>,
): WorkloadHeatArtifact {
  const path = getWorkloadHeatPath(cwd);
  const artifact = map.exportArtifact({
    created_at: new Date().toISOString(),
    source: 'operator-local',
    ...provenance,
  });

  // Validate before writing so a serialization regression cannot persist a
  // malformed artifact that later loads fail on.
  WorkloadHeatArtifactSchema.parse(artifact);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifact;
}

/**
 * Clear the persisted histogram (router-reset analog). Returns true when a
 * file was removed; false when nothing was persisted.
 */
export function clearWorkloadHeatFile(cwd: string = process.cwd()): boolean {
  const path = getWorkloadHeatPath(cwd);
  if (!existsSync(path)) {
    return false;
  }
  rmSync(path);
  return true;
}
