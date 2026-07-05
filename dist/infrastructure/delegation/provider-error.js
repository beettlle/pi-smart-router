/**
 * Parse provider error payloads from pi-ai assistant errorMessage strings.
 */
import { isInfraError } from '../gateway/circuit-breaker.js';
function parseNumericCode(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value)) {
        return Number.parseInt(value, 10);
    }
    return undefined;
}
/**
 * Extract HTTP status / error code from JSON provider error blobs.
 */
export function parseProviderError(errorMessage) {
    const trimmed = errorMessage.trim();
    if (!trimmed.startsWith('{')) {
        const statusMatch = trimmed.match(/\b(429|5\d{2})\b/);
        if (statusMatch) {
            return { statusCode: Number.parseInt(statusMatch[1], 10) };
        }
        return undefined;
    }
    try {
        const parsed = JSON.parse(trimmed);
        const nested = parsed.error;
        const statusCode = parseNumericCode(nested?.code) ??
            parseNumericCode(nested?.status) ??
            parseNumericCode(parsed.code) ??
            parseNumericCode(parsed.status);
        const code = typeof nested?.status === 'string'
            ? nested.status
            : typeof parsed.status === 'string'
                ? parsed.status
                : undefined;
        let message = typeof nested?.message === 'string'
            ? nested.message
            : typeof parsed.message === 'string'
                ? parsed.message
                : undefined;
        if (message && message.trim().startsWith('{')) {
            try {
                const inner = JSON.parse(message);
                if (typeof inner.error?.message === 'string') {
                    message = inner.error.message;
                }
                else if (typeof inner.message === 'string') {
                    message = inner.message;
                }
            }
            catch {
                // Nested provider error payloads may be malformed JSON — keep outer message.
            }
        }
        if (statusCode === undefined && code === undefined && message === undefined) {
            return undefined;
        }
        return {
            ...(statusCode !== undefined ? { statusCode } : {}),
            ...(code ? { code } : {}),
            ...(message ? { message } : {}),
        };
    }
    catch {
        return undefined;
    }
}
export function parseAssistantMessageError(message) {
    if (message.stopReason !== 'error' || !message.errorMessage) {
        return undefined;
    }
    return parseProviderError(message.errorMessage);
}
export function isInfraAssistantError(message) {
    const parsed = parseAssistantMessageError(message);
    if (!parsed) {
        return false;
    }
    return isInfraError(parsed);
}
const FORMATTED_ERROR_MAX_LENGTH = 200;
/**
 * Format a provider error blob for user-facing display (terminal/session).
 * Never returns raw nested JSON.
 */
export function formatProviderErrorMessage(errorMessage) {
    const parsed = parseProviderError(errorMessage);
    if (parsed) {
        const prefixParts = [];
        if (parsed.statusCode !== undefined) {
            prefixParts.push(String(parsed.statusCode));
        }
        if (parsed.code) {
            prefixParts.push(parsed.code);
        }
        const prefix = prefixParts.length > 0 ? `${prefixParts.join(' ')}: ` : '';
        if (parsed.message) {
            return `${prefix}${parsed.message}`;
        }
        if (prefixParts.length > 0) {
            return `Provider error (${prefixParts.join(' ')})`;
        }
    }
    const trimmed = errorMessage.trim();
    if (trimmed.startsWith('{')) {
        return 'Provider error (unparseable response)';
    }
    if (trimmed.length > FORMATTED_ERROR_MAX_LENGTH) {
        return `${trimmed.slice(0, FORMATTED_ERROR_MAX_LENGTH)}…`;
    }
    return trimmed;
}
//# sourceMappingURL=provider-error.js.map