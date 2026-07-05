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
export const DATASET_ENABLED_NOTIFY_MESSAGE = 'Smart Router dataset mode is enabled. Recording routing metadata and feature fields only — prompt text, messages, and tool arguments are never stored.';
export const DATASET_STATE_DIR = '.pi-smart-router';
export const DATASET_PEPPER_FILENAME = '.dataset-key';
const DATASET_PEPPER_BYTES = 32;
export function isDatasetRecordingEnabled() {
    return process.env.SMART_ROUTER_DATASET === '1';
}
export function isDatasetFingerprintEnabled() {
    return (isDatasetRecordingEnabled() &&
        process.env.SMART_ROUTER_DATASET_FINGERPRINT === '1');
}
export function getDatasetPepperPath(cwd = process.cwd()) {
    return join(cwd, DATASET_STATE_DIR, DATASET_PEPPER_FILENAME);
}
/** Load or create the install-local dataset pepper (never exported). */
export function loadOrCreateDatasetPepper(cwd = process.cwd()) {
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
export function normalizePromptForFingerprint(prompt) {
    return prompt.trim().replace(/\s+/g, ' ');
}
export function computePromptFingerprint(pepper, prompt) {
    return createHmac('sha256', pepper)
        .update(normalizePromptForFingerprint(prompt))
        .digest('hex');
}
function hasToolContext(request) {
    if (request.turn_type === 'tool_result') {
        return true;
    }
    return request.messages?.some((message) => message.role === 'tool') ?? false;
}
function serializeCandidates(decision) {
    const candidates = decision.features?.candidates ?? decision.candidates;
    if (!candidates || candidates.length === 0) {
        return null;
    }
    return JSON.stringify(candidates);
}
/** Map a completed routing decision to a privacy-safe dataset row. */
export function buildDatasetRecord(request, decision, timestamp, promptFingerprint = null) {
    const triage = decision.features?.triage ?? null;
    const requirements = decision.features?.requirements ?? null;
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
        triage_trivial_hits: null,
        triage_complex_hits: null,
        triage_sanitized_length_delta: null,
        requirement_reasoning: requirements?.reasoning ?? null,
        requirement_code_gen: requirements?.code_gen ?? null,
        requirement_tool_use: requirements?.tool_use ?? null,
        routing_latency_ms: decision.routing_latency_ms,
        estimated_cost_usd: decision.estimated_cost_usd ?? null,
        prompt_fingerprint: promptFingerprint,
    };
}
export class DatasetRecorder {
    clock;
    onRecord;
    onFirstEnable;
    cwd;
    loadPepper;
    enabledNotified = false;
    pepper = null;
    constructor(options) {
        this.clock = options?.clock ?? (() => new Date().toISOString());
        this.onRecord = options?.onRecord;
        this.onFirstEnable = options?.onFirstEnable;
        this.cwd = options?.cwd ?? process.cwd();
        this.loadPepper = options?.loadPepper ?? loadOrCreateDatasetPepper;
    }
    getPepper() {
        if (!this.pepper) {
            this.pepper = this.loadPepper(this.cwd);
        }
        return this.pepper;
    }
    /** Record a routing decision when dataset mode is enabled; no-op when off. */
    record(request, decision) {
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
        const record = buildDatasetRecord(request, decision, this.clock(), promptFingerprint);
        this.onRecord?.(record);
        return record;
    }
}
//# sourceMappingURL=dataset-recorder.js.map
