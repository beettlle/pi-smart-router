/**
 * Fleet catalog loader — reads models.yaml and validates against ModelProfileSchema.
 * Maps to T011 in the routing pipeline spec.
 */
import { z } from 'zod';
declare const FleetCatalogSchema: z.ZodObject<{
    models: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        tier: z.ZodEnum<{
            "zero-tier": "zero-tier";
            "economical-cloud": "economical-cloud";
            "frontier-cloud": "frontier-cloud";
        }>;
        provider: z.ZodString;
        endpoint: z.ZodOptional<z.ZodString>;
        capabilities: z.ZodObject<{
            reasoning: z.ZodNumber;
            code_gen: z.ZodNumber;
            tool_use: z.ZodNumber;
        }, z.core.$strip>;
        performance: z.ZodOptional<z.ZodObject<{
            latency_p50_ms: z.ZodOptional<z.ZodNumber>;
            verbosity_factor: z.ZodOptional<z.ZodNumber>;
            cache_friendly: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>;
        pricing: z.ZodObject<{
            registry_key: z.ZodOptional<z.ZodString>;
            fallback_cost_per_1m: z.ZodNumber;
        }, z.core.$strip>;
        healthy: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type FleetCatalog = z.infer<typeof FleetCatalogSchema>;
export interface LoadModelsOptions {
    readonly filePath?: string;
}
/**
 * Load and validate the fleet model catalog from a YAML file.
 *
 * @throws {ModelsLoaderError} when the file cannot be read or validation fails.
 */
export declare function loadModels(options?: LoadModelsOptions): FleetCatalog;
export declare class ModelsLoaderError extends Error {
    readonly name = "ModelsLoaderError";
    constructor(message: string, options?: ErrorOptions);
}
export {};
//# sourceMappingURL=models-loader.d.ts.map
