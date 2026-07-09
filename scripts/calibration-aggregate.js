#!/usr/bin/env node
/**
 * Calibration contrib aggregate and validate — SP-116, GitHub #66 (stage 1–2).
 *
 * Collects privacy-safe JSONL contributions from `data/contrib/` (or stdin),
 * rejects tainted payloads (prompt text, messages, secrets), strips install-local
 * pepper fields, and emits validated JSONL for offline training (SP-117).
 *
 * Minimum sample sizes for training are documented in
 * `specs/001-build-smart-router/contracts/routing-calibration.schema.json`
 * (`minimum_training_samples`) and `config/routing-calibration.json.example`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { MIN_TRAINING_SAMPLES, attachFailureProxiesToExport, deriveSuccessLabelFromExportRow, P_SUCCESS_FAILURE_PROXY_FIELDS, } from '../src/domain/routing/p-success-classifier.js';
export const DEFAULT_CONTRIB_DIR = 'data/contrib';
/** Documented minimum labeled rows before each artifact deviates from defaults. */
export const MINIMUM_TRAINING_SAMPLES = {
    hydra_projection: 100,
    triage_thresholds: 50,
    p_success_weights: MIN_TRAINING_SAMPLES,
    isotonic_calibrator: MIN_TRAINING_SAMPLES,
    routing_centroids: 10,
};
/** Keys whose presence rejects the whole contrib row (prompt content, raw identifiers). */
export const CALIBRATION_CONTRIB_REJECT_KEYS = [
    'session_id',
    'prompt_text',
    'messages',
    'prompt',
    'prompt_fingerprint',
];
/** Install-local pepper and correlation fields — stripped after validation, not rejected. */
export const CALIBRATION_CONTRIB_STRIP_KEYS = [
    'request_id',
    'pepper',
    'install_pepper',
    'dataset_pepper',
    'dataset_key',
    'pepper_key',
    'install_key',
];
/** Keys whose names suggest prompt or message content — reject on ingest. */
export const CONTRIB_TAINTED_KEY_PATTERN = /(?:^|_)(prompt|message|messages|content|tool_calls?|secret|password|token|api_key)(?:_|$)/i;
export class CalibrationContribError extends Error {
    name = 'CalibrationContribError';
    constructor(message, options) {
        super(message, options);
    }
}
/** Raw telemetry keys mapped into privacy-safe failure proxy fields (SP-131). */
export const CALIBRATION_CONTRIB_STRIP_AFTER_PROXY_MAP = [
    'stop_reason',
    'consecutive_tool_failures',
    'reprompt_count',
    'turn_index_in_session',
    'prompt_length_delta',
    'prior_prompt_length_chars',
];
export { P_SUCCESS_FAILURE_PROXY_FIELDS };
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function collectForbiddenKeys(value, path = '', found = []) {
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            collectForbiddenKeys(value[i], `${path}[${i}]`, found);
        }
        return found;
    }
    if (!isPlainObject(value)) {
        return found;
    }
    for (const [key, nested] of Object.entries(value)) {
        const keyPath = path ? `${path}.${key}` : key;
        if (CALIBRATION_CONTRIB_REJECT_KEYS.includes(key) ||
            CONTRIB_TAINTED_KEY_PATTERN.test(key)) {
            found.push(keyPath);
        }
        collectForbiddenKeys(nested, keyPath, found);
    }
    return found;
}
/** Fail closed when a contrib row contains forbidden or tainted keys. */
export function assertContribRecordSafe(record, context) {
    if (!isPlainObject(record)) {
        const suffix = context ? ` (${context})` : '';
        throw new CalibrationContribError(`Contrib record must be a JSON object${suffix}`);
    }
    const forbidden = collectForbiddenKeys(record);
    if (forbidden.length > 0) {
        const suffix = context ? ` (${context})` : '';
        throw new CalibrationContribError(`Tainted contrib record rejected${suffix}: forbidden keys ${forbidden.join(', ')}`);
    }
}
/** Strip install-local pepper fields from a validated contrib row. */
export function sanitizeContribRecord(record) {
    const sanitized = { ...record };
    for (const key of CALIBRATION_CONTRIB_STRIP_KEYS) {
        delete sanitized[key];
    }
    return sanitized;
}
/** Map telemetry scalars to normalized failure proxies and refreshed training labels. */
export function enrichContribRecordWithFailureLabels(record) {
    const withProxies = attachFailureProxiesToExport(record);
    const labeled = deriveSuccessLabelFromExportRow(withProxies);
    const enriched = {
        ...withProxies,
        success_label: labeled.success,
        outcome_signals: labeled.outcome_signals,
        tool_failure_chain_count: labeled.failure_proxies.tool_failure_chain_count,
        stop_reason_invalid: labeled.failure_proxies.stop_reason_invalid,
        reprompt_rate: labeled.failure_proxies.reprompt_rate,
        edit_distance_proxy: labeled.failure_proxies.edit_distance_proxy,
    };
    for (const key of CALIBRATION_CONTRIB_STRIP_AFTER_PROXY_MAP) {
        delete enriched[key];
    }
    return enriched;
}
export function enrichContribRecords(records) {
    return records.map((record) => enrichContribRecordWithFailureLabels(record));
}
export function parseContribJsonl(text, source = 'input') {
    const lines = text.split(/\r?\n/);
    const records = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length === 0) {
            continue;
        }
        let parsed;
        try {
            parsed = JSON.parse(line);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new CalibrationContribError(`Invalid JSONL at ${source}:${i + 1}: ${message}`);
        }
        assertContribRecordSafe(parsed, `${source}:${i + 1}`);
        records.push(enrichContribRecordWithFailureLabels(sanitizeContribRecord(parsed)));
    }
    return records;
}
export function parseContribJson(text, source = 'input') {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new CalibrationContribError(`Invalid JSON at ${source}: ${message}`);
    }
    if (Array.isArray(parsed)) {
        const records = [];
        for (let i = 0; i < parsed.length; i++) {
            assertContribRecordSafe(parsed[i], `${source}[${i}]`);
            records.push(enrichContribRecordWithFailureLabels(sanitizeContribRecord(parsed[i])));
        }
        return records;
    }
    assertContribRecordSafe(parsed, source);
    return [enrichContribRecordWithFailureLabels(sanitizeContribRecord(parsed))];
}
function listContribFiles(contribDir) {
    let entries;
    try {
        entries = readdirSync(contribDir);
    }
    catch (err) {
        const code = err.code;
        if (code === 'ENOENT') {
            return [];
        }
        throw err;
    }
    return entries
        .filter((name) => name.endsWith('.json') || name.endsWith('.jsonl'))
        .map((name) => join(contribDir, name))
        .filter((path) => statSync(path).isFile())
        .sort();
}
export function readContribFile(filePath) {
    const text = readFileSync(filePath, 'utf8');
    if (filePath.endsWith('.jsonl')) {
        return parseContribJsonl(text, filePath);
    }
    return parseContribJson(text, filePath);
}
export function collectContribFromDir(contribDir) {
    const files = listContribFiles(contribDir);
    const records = [];
    for (const filePath of files) {
        records.push(...readContribFile(filePath));
    }
    return {
        records,
        accepted: records.length,
        rejected: 0,
        source_files: files,
    };
}
export async function readContribFromStdin() {
    if (process.stdin.isTTY) {
        return [];
    }
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    }
    const text = chunks.join('');
    if (text.trim().length === 0) {
        return [];
    }
    if (text.includes('\n')) {
        return parseContribJsonl(text, 'stdin');
    }
    return parseContribJson(text, 'stdin');
}
export function aggregateContribRecords(batches) {
    return batches.flatMap((batch) => [...batch]);
}
export function formatContribJsonl(records) {
    if (records.length === 0) {
        return '';
    }
    return records.map((record) => JSON.stringify(record)).join('\n') + '\n';
}
function usage() {
    console.error([
        'Usage: npm run routing:calibration-aggregate -- [options]',
        '',
        'Options:',
        '  --contrib-dir <path>  Directory with .json/.jsonl contrib files (default: data/contrib)',
        '  --stdin               Also read JSONL from stdin (merged with directory files)',
        '  --quiet               Suppress summary on stderr',
        '  -h, --help            Show this help',
        '',
        'Writes validated JSONL to stdout. Rejects records containing prompt text,',
        'messages, or install-local pepper fields.',
    ].join('\n'));
}
async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) {
        usage();
        return;
    }
    let contribDir = resolve(DEFAULT_CONTRIB_DIR);
    let includeStdin = false;
    let quiet = false;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--contrib-dir') {
            const next = args[i + 1];
            if (!next) {
                throw new CalibrationContribError('--contrib-dir requires a path');
            }
            contribDir = resolve(next);
            i++;
            continue;
        }
        if (arg === '--stdin') {
            includeStdin = true;
            continue;
        }
        if (arg === '--quiet') {
            quiet = true;
            continue;
        }
        throw new CalibrationContribError(`Unknown argument: ${arg}`);
    }
    const dirResult = collectContribFromDir(contribDir);
    const stdinRecords = includeStdin || !process.stdin.isTTY
        ? await readContribFromStdin()
        : [];
    const records = aggregateContribRecords([dirResult.records, stdinRecords]);
    process.stdout.write(formatContribJsonl(records));
    if (!quiet) {
        const sources = [...dirResult.source_files];
        if (stdinRecords.length > 0) {
            sources.push('stdin');
        }
        console.error(`calibration-aggregate: accepted ${records.length} record(s) from ${sources.length} source(s)`);
        if (records.length < MINIMUM_TRAINING_SAMPLES.p_success_weights) {
            console.error(`calibration-aggregate: warning — fewer than ${MINIMUM_TRAINING_SAMPLES.p_success_weights} rows; P(success) training will use neutral fallback`);
        }
    }
}
main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`calibration-aggregate failed: ${message}`);
    process.exit(1);
});
//# sourceMappingURL=calibration-aggregate.js.map