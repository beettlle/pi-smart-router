/**
 * Fleet catalog loader — reads models.yaml and validates against ModelProfileSchema.
 * Maps to T011 in the routing pipeline spec.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { ModelProfileSchema } from '../domain/types/schemas.js';
const FleetCatalogSchema = z.object({
    models: z.array(ModelProfileSchema).min(1, 'Fleet catalog must contain at least one model'),
});
/**
 * Load and validate the fleet model catalog from a YAML file.
 *
 * @throws {ModelsLoaderError} when the file cannot be read or validation fails.
 */
export function loadModels(options) {
    const filePath = options?.filePath ?? resolve('config', 'models.yaml');
    let raw;
    try {
        raw = readFileSync(filePath, 'utf8');
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new ModelsLoaderError(`Failed to read models file: ${message}`, { cause: err });
    }
    let parsed;
    try {
        parsed = parseYaml(raw);
    }
    catch (err) {
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
    return result.data;
}
export class ModelsLoaderError extends Error {
    name = 'ModelsLoaderError';
    constructor(message, options) {
        super(message, options);
    }
}
//# sourceMappingURL=models-loader.js.map
