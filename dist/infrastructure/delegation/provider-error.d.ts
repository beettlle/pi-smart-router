/**
 * Parse provider error payloads from pi-ai assistant errorMessage strings.
 */
import type { AssistantMessage } from '@earendil-works/pi-ai/compat';
export interface ParsedProviderError {
    readonly statusCode?: number;
    readonly code?: string;
    readonly message?: string;
}
/**
 * Extract HTTP status / error code from JSON provider error blobs.
 */
export declare function parseProviderError(errorMessage: string): ParsedProviderError | undefined;
export declare function parseAssistantMessageError(message: AssistantMessage): ParsedProviderError | undefined;
export declare function isInfraAssistantError(message: AssistantMessage): boolean;
/**
 * Format a provider error blob for user-facing display (terminal/session).
 * Never returns raw nested JSON.
 */
export declare function formatProviderErrorMessage(errorMessage: string): string;
//# sourceMappingURL=provider-error.d.ts.map