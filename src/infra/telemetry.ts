/**
 * Privacy-safe community telemetry export (SP-082).
 *
 * Maps routing telemetry rows to anonymized community export shapes and
 * HyDRA calibration batches. Never exports prompt text, messages, request_id,
 * or raw session_id — session identifiers are one-way hashed only.
 */

import { createHash } from 'node:crypto';

import type {
  RoutingFeatureSidecar,
  RoutingTelemetry,
} from '../domain/types/index.js';

export const COMMUNITY_TELEMETRY_ENABLED_ENV = 'SMART_ROUTER_COMMUNITY_TELEMETRY';

export const COMMUNITY_TELEMETRY_ENABLED_NOTIFY_MESSAGE =
  'Smart Router community telemetry export is enabled. Only anonymized routing metadata is exported — no prompt text, messages, or raw session identifiers.';

export const TELEMETRY_EXPORT_FORBIDDEN_KEYS = [
  'session_id',
  'request_id',
  'prompt_text',
  'messages',
  'prompt',
  'pepper',
  'install_pepper',
  'dataset_pepper',
  'dataset_key',
  'prompt_fingerprint',
] as const;

export const HYDRA_CALIBRATION_STAGE = 'hydra_match' as const;

export function isCommunityTelemetryExportEnabled(): boolean {
  return process.env[COMMUNITY_TELEMETRY_ENABLED_ENV] === '1';
}

/** One-way hash for session correlation without exporting raw session_id. */
export function hashSessionIdForTelemetryExport(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}

export interface CommunityTelemetryRecord {
  readonly timestamp: string;
  readonly session_id_hash: string;
  readonly turn_type: string;
  readonly stage: string;
  readonly reason_code: string;
  readonly selected_model_id: string;
  readonly estimated_cost_usd: number;
  readonly routing_latency_ms: number;
  readonly pin_reason: string | null;
}

/** HyDRA calibration row — routing signals only, no prompt content. */
export interface HydraCalibrationRecord {
  readonly timestamp: string;
  readonly session_id_hash: string;
  readonly turn_type: string;
  readonly reason_code: string;
  readonly selected_model_id: string;
  readonly routing_latency_ms: number;
  readonly requirement_reasoning: number | null;
  readonly requirement_code_gen: number | null;
  readonly requirement_tool_use: number | null;
  readonly top_candidate_model_id: string | null;
  readonly top_candidate_score: number | null;
}

export function isHydraMatchTelemetry(record: RoutingTelemetry): boolean {
  return record.stage === HYDRA_CALIBRATION_STAGE;
}

export function selectHydraMatchTelemetry(
  records: readonly RoutingTelemetry[],
): readonly RoutingTelemetry[] {
  return records.filter(isHydraMatchTelemetry);
}

/** Map a telemetry row to a privacy-safe community export object. */
export function toCommunityTelemetryRecord(
  record: RoutingTelemetry,
): CommunityTelemetryRecord {
  return {
    timestamp: record.timestamp,
    session_id_hash: hashSessionIdForTelemetryExport(record.session_id),
    turn_type: record.turn_type,
    stage: record.stage,
    reason_code: record.reason_code,
    selected_model_id: record.selected_model_id,
    estimated_cost_usd: record.estimated_cost_usd,
    routing_latency_ms: record.routing_latency_ms,
    pin_reason: record.pin_reason,
  };
}

function topViableCandidate(features: RoutingFeatureSidecar | undefined): {
  readonly model_id: string | null;
  readonly score: number | null;
} {
  const candidates = features?.candidates;
  if (!candidates || candidates.length === 0) {
    return { model_id: null, score: null };
  }

  const viable = candidates.filter((candidate) => candidate.rejected_reason === null);
  const pool = viable.length > 0 ? viable : [...candidates];
  const best = pool.reduce((leading, candidate) =>
    candidate.score > leading.score ? candidate : leading,
  );

  return { model_id: best.model_id, score: best.score };
}

/** Map a hydra_match telemetry row to a collaborative calibration export row. */
export function toHydraCalibrationRecord(
  record: RoutingTelemetry,
  features?: RoutingFeatureSidecar,
): HydraCalibrationRecord {
  const requirements = features?.requirements ?? null;
  const top = topViableCandidate(features);

  return {
    timestamp: record.timestamp,
    session_id_hash: hashSessionIdForTelemetryExport(record.session_id),
    turn_type: record.turn_type,
    reason_code: record.reason_code,
    selected_model_id: record.selected_model_id,
    routing_latency_ms: record.routing_latency_ms,
    requirement_reasoning: requirements?.reasoning ?? null,
    requirement_code_gen: requirements?.code_gen ?? null,
    requirement_tool_use: requirements?.tool_use ?? null,
    top_candidate_model_id: top.model_id,
    top_candidate_score: top.score,
  };
}

export function formatCommunityTelemetryJsonl(
  records: readonly RoutingTelemetry[],
): string {
  return records
    .map((record) => JSON.stringify(toCommunityTelemetryRecord(record)))
    .join('\n');
}

export function formatHydraCalibrationJsonl(
  records: readonly RoutingTelemetry[],
  featuresByRequestId?: ReadonlyMap<string, RoutingFeatureSidecar>,
): string {
  return selectHydraMatchTelemetry(records)
    .map((record) => {
      const features = featuresByRequestId?.get(record.request_id);
      return JSON.stringify(toHydraCalibrationRecord(record, features));
    })
    .join('\n');
}

/** Defense-in-depth scrub for loose export objects. */
export function scrubTelemetryExportObject(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const scrubbed = { ...value };
  for (const key of TELEMETRY_EXPORT_FORBIDDEN_KEYS) {
    delete scrubbed[key];
  }
  return scrubbed;
}
