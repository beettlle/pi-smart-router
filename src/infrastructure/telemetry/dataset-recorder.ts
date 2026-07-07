/**
 * Privacy-safe routing dataset recorder (SP-058).
 *
 * Maps routing decisions and feature sidecars to RoutingDatasetRecord when
 * SMART_ROUTER_DATASET=1. Never stores prompt text, messages, or tool arguments.
 *
 * Optional install-local prompt fingerprints (SP-061) when
 * SMART_ROUTER_DATASET_FINGERPRINT=1.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type {
  RoutingDatasetRecord,
  RoutingDecision,
  RoutingRequest,
} from '../../domain/types/index.js';
import type { TierFeatureDatasetScalars } from '../../domain/routing/tier-features.js';
import {
  buildContextFitObservability,
  buildTierSelectionObservability,
  type ContextFitObservabilityInput,
} from './routing-telemetry.js';

export const DATASET_ENABLED_NOTIFY_MESSAGE =
  'Smart Router dataset mode is enabled. Recording routing metadata and feature fields only — prompt text, messages, and tool arguments are never stored.';

export const DATASET_STATE_DIR = '.pi-smart-router';
export const DATASET_PEPPER_FILENAME = '.dataset-key';

const DATASET_PEPPER_BYTES = 32;

export function isDatasetRecordingEnabled(): boolean {
  return process.env.SMART_ROUTER_DATASET === '1';
}

export function isDatasetFingerprintEnabled(): boolean {
  return (
    isDatasetRecordingEnabled() &&
    process.env.SMART_ROUTER_DATASET_FINGERPRINT === '1'
  );
}

export function getDatasetPepperPath(cwd: string = process.cwd()): string {
  return join(cwd, DATASET_STATE_DIR, DATASET_PEPPER_FILENAME);
}

/** Load or create the install-local dataset pepper (never exported). */
export function loadOrCreateDatasetPepper(cwd: string = process.cwd()): Buffer {
  const pepperPath = getDatasetPepperPath(cwd);
  mkdirSync(dirname(pepperPath), { recursive: true });

  if (existsSync(pepperPath)) {
    const raw = readFileSync(pepperPath, 'utf8').trim();
    return Buffer.from(raw, 'hex');
  }

  const pepper = randomBytes(DATASET_PEPPER_BYTES);
  writeFileSync(pepperPath, pepper.toString('hex'), { mode: 0o600 });
  return pepper;
}

/** Collapse whitespace and trim for stable duplicate detection. */
export function normalizePromptForFingerprint(prompt: string): string {
  return prompt.trim().replace(/\s+/g, ' ');
}

export function computePromptFingerprint(pepper: Buffer, prompt: string): string {
  return createHmac('sha256', pepper)
    .update(normalizePromptForFingerprint(prompt))
    .digest('hex');
}

export interface DatasetRecorderOptions {
  readonly clock?: () => string;
  readonly onRecord?: (record: RoutingDatasetRecord) => void;
  readonly onFirstEnable?: () => void;
  readonly cwd?: string;
  readonly loadPepper?: (cwd: string) => Buffer;
  readonly contextFitInput?: Omit<ContextFitObservabilityInput, 'request' | 'decision'>;
}

function hasToolContext(request: RoutingRequest): boolean {
  if (request.turn_type === 'tool_result') {
    return true;
  }

  return request.messages?.some((message) => message.role === 'tool') ?? false;
}

function serializeCandidates(decision: RoutingDecision): string | null {
  const candidates = decision.features?.candidates ?? decision.candidates;
  if (!candidates || candidates.length === 0) {
    return null;
  }

  return JSON.stringify(candidates);
}

/** Map a completed routing decision to a privacy-safe dataset row. */
export function buildDatasetRecord(
  request: RoutingRequest,
  decision: RoutingDecision,
  timestamp: string,
  promptFingerprint: string | null = null,
  tierScalars?: TierFeatureDatasetScalars,
  contextFitInput?: Omit<ContextFitObservabilityInput, 'request' | 'decision'>,
): RoutingDatasetRecord {
  const triage = decision.features?.triage ?? null;
  const requirements = decision.features?.requirements ?? null;
  const contextFit = buildContextFitObservability({
    request,
    decision,
    ...contextFitInput,
  });
  const tierSelection = buildTierSelectionObservability({ decision });

  return {
    request_id: decision.request_id,
    timestamp,
    turn_type: request.turn_type ?? 'unknown',
    stage: decision.stage,
    reason_code: decision.reason_code,
    selected_model_id: decision.selected_model_id,
    tier: decision.tier,
    candidates_json: serializeCandidates(decision),
    prompt_length_chars: request.prompt_text.length,
    estimated_input_tokens: request.estimated_input_tokens ?? null,
    message_count: request.messages?.length ?? 0,
    has_tool_context: hasToolContext(request),
    compaction_flag: request.compaction_flag ?? false,
    triage_verdict: triage?.verdict ?? null,
    triage_reason_code: triage?.reason_code ?? null,
    triage_cyclomatic_score: triage?.cyclomatic_score ?? null,
    triage_trivial_hits: tierScalars?.triage_trivial_hits ?? null,
    triage_complex_hits: tierScalars?.triage_complex_hits ?? null,
    triage_sanitized_length_delta: tierScalars?.triage_sanitized_length_delta ?? null,
    requirement_reasoning: requirements?.reasoning ?? null,
    requirement_code_gen: requirements?.code_gen ?? null,
    requirement_tool_use: requirements?.tool_use ?? null,
    routing_latency_ms: decision.routing_latency_ms,
    estimated_cost_usd: decision.estimated_cost_usd ?? null,
    prompt_fingerprint: promptFingerprint,
    estimated_input_tokens_gate: contextFit?.estimated_input_tokens ?? null,
    context_fit_viable_count: contextFit?.context_fit_viable_count ?? null,
    context_fit_rejected_json: contextFit?.context_fit_rejected_json ?? null,
    context_overflow_pin_break: contextFit?.context_overflow_pin_break ?? false,
    selected_model_max_input_tokens: contextFit?.selected_model_max_input_tokens ?? null,
    context_fit_reason_code: contextFit?.context_fit_reason_code ?? null,
    cluster_id: tierSelection?.cluster_id ?? null,
    cluster_similarity: tierSelection?.cluster_similarity ?? null,
    cluster_margin: tierSelection?.cluster_margin ?? null,
    low_intensity_score: tierSelection?.low_intensity_score ?? null,
    tier_hint: tierSelection?.tier_hint ?? null,
    p_success_cheap: tierSelection?.p_success_cheap ?? null,
    local_eligible_reason: tierSelection?.local_eligible_reason ?? null,
    tier_selection_reason_code: tierSelection?.tier_selection_reason_code ?? null,
  };
}

export class DatasetRecorder {
  private readonly clock: () => string;
  private readonly onRecord: ((record: RoutingDatasetRecord) => void) | undefined;
  private readonly onFirstEnable: (() => void) | undefined;
  private readonly cwd: string;
  private readonly loadPepper: (cwd: string) => Buffer;
  private readonly contextFitInput: Omit<ContextFitObservabilityInput, 'request' | 'decision'> | undefined;
  private enabledNotified = false;
  private pepper: Buffer | null = null;

  constructor(options?: DatasetRecorderOptions) {
    this.clock = options?.clock ?? (() => new Date().toISOString());
    this.onRecord = options?.onRecord;
    this.onFirstEnable = options?.onFirstEnable;
    this.cwd = options?.cwd ?? process.cwd();
    this.loadPepper = options?.loadPepper ?? loadOrCreateDatasetPepper;
    this.contextFitInput = options?.contextFitInput;
  }

  private getPepper(): Buffer {
    if (!this.pepper) {
      this.pepper = this.loadPepper(this.cwd);
    }
    return this.pepper;
  }

  /** Record a routing decision when dataset mode is enabled; no-op when off. */
  record(request: RoutingRequest, decision: RoutingDecision): RoutingDatasetRecord | null {
    if (!isDatasetRecordingEnabled()) {
      return null;
    }

    if (!this.enabledNotified) {
      this.enabledNotified = true;
      this.onFirstEnable?.();
    }

    const promptFingerprint = isDatasetFingerprintEnabled()
      ? computePromptFingerprint(this.getPepper(), request.prompt_text)
      : null;

    const record = buildDatasetRecord(
      request,
      decision,
      this.clock(),
      promptFingerprint,
      undefined,
      this.contextFitInput,
    );
    this.onRecord?.(record);
    return record;
  }
}
