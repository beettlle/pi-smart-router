/**
 * Turn envelope classifier — T029, <2ms budget.
 *
 * Derives turn_type from the messages envelope using deterministic
 * heuristics (no neural inference). Falls back to 'unknown' when
 * the envelope is empty or unclassifiable.
 *
 * Classification priority (first match wins):
 *   1. tool_result  — last message is role=tool
 *   2. planning     — planning/architecture signals in recent content
 *   3. subagent     — subagent/exploration context markers
 *   4. main_loop    — default agent loop turn (messages present)
 *   5. unknown      — no messages or empty envelope
 */
// ─── Constants ────────────────────────────────────────────────────────────────
const TOOL_RESULT_SIZE_THRESHOLD = 50_000;
const PLANNING_PATTERNS = [
    /\b(?:plan|planning|architect(?:ure)?|design|refactor|migration)\b/i,
    /\b(?:step\s*\d|phase\s*\d|breakdown|strategy|trade-?off)\b/i,
    /^#+\s*(?:plan|design|architecture)/im,
];
const SUBAGENT_PATTERNS = [
    /\b(?:subagent|sub-agent|exploration|explore|search|investigate)\b/i,
    /\b(?:spawned|delegat(?:e|ed|ing)|parallel\s+agent)\b/i,
    /\b(?:Task|Agent)\.(?:create|spawn|launch)\b/,
];
// ─── Classifier ───────────────────────────────────────────────────────────────
export function classifyTurnEnvelope(messages) {
    if (!messages || messages.length === 0) {
        return 'unknown';
    }
    const lastMessage = messages[messages.length - 1];
    if (isToolResult(lastMessage)) {
        return 'tool_result';
    }
    if (hasPlanningSignals(messages)) {
        return 'planning';
    }
    if (hasSubagentSignals(messages)) {
        return 'subagent';
    }
    return 'main_loop';
}
// ─── Signal detectors ─────────────────────────────────────────────────────────
function isToolResult(message) {
    if (message.role !== 'tool')
        return false;
    return message.content.length <= TOOL_RESULT_SIZE_THRESHOLD;
}
function hasPlanningSignals(messages) {
    const window = recentWindow(messages, 3);
    for (const msg of window) {
        if (matchesAny(msg.content, PLANNING_PATTERNS)) {
            return true;
        }
    }
    return false;
}
function hasSubagentSignals(messages) {
    const window = recentWindow(messages, 3);
    for (const msg of window) {
        if (matchesAny(msg.content, SUBAGENT_PATTERNS)) {
            return true;
        }
    }
    return false;
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function recentWindow(messages, count) {
    const start = Math.max(0, messages.length - count);
    return messages.slice(start);
}
function matchesAny(text, patterns) {
    for (const pattern of patterns) {
        if (pattern.test(text)) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=turn-envelope.js.map