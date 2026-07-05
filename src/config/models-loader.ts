/**
 * Fleet catalog loader — reads models.yaml and validates against ModelProfileSchema.
 * Maps to T011 in the routing pipeline spec.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { ModelProfileSchema } from '../domain/types/schemas.js';
import type { ModelProfile } from '../domain/types/index.js';

const FleetCatalogSchema = z.object({
  models: z.array(ModelProfileSchema).min(1, 'Fleet catalog must contain at least one model'),
});

export interface FleetCatalog {
  readonly models: readonly ModelProfile[];
}

export interface LoadModelsOptions {
  readonly filePath?: string;
}

/**
 * Load and validate the fleet model catalog from a YAML file.
 *
 * @throws {ModelsLoaderError} when the file cannot be read or validation fails.
 */
export function loadModels(options?: LoadModelsOptions): FleetCatalog {
  const filePath = options?.filePath ?? resolve('config', 'models.yaml');

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ModelsLoaderError(`Failed to read models file: ${message}`, { cause: err });
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ModelsLoaderError(`Failed to parse YAML: ${message}`, { cause: err });
  }

  const result = FleetCatalogSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new ModelsLoaderError(`Invalid fleet catalog:\n${issues}`, { cause: result.error });
  }

  return { models: result.data.models };
}

export class ModelsLoaderError extends Error {
  override readonly name = 'ModelsLoaderError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}
