/**
 * Pi model registry → ModelProfile mapper.
 *
 * Maps pi `Model` objects (provider + id) to router fleet entries using
 * pattern-based lookup for known families. Unknown models receive conservative
 * economical-cloud defaults.
 */
import type { ModelProfile } from '../domain/types/entities.js';
/** Pi registry `Model.cost` shape — per-token USD rates. */
export interface PiRegistryCost {
    readonly input: number;
    readonly output: number;
    readonly cacheRead: number;
    readonly cacheWrite: number;
}
export interface PiModelInput {
    readonly provider: string;
    readonly id: string;
    readonly name?: string;
    readonly cost?: PiRegistryCost;
}
/**
 * Map a pi model registry entry to a router ModelProfile.
 */
export declare function mapPiModelToProfile(input: PiModelInput): ModelProfile;
/**
 * Map an array of pi registry models to a router fleet catalog.
 */
export declare function mapFleetFromRegistry(models: readonly PiModelInput[]): ModelProfile[];
//# sourceMappingURL=pi-model-mapper.d.ts.map
