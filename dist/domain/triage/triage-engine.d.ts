/**
 * Triage engine — FR-003, FR-004, US2.
 *
 * Deterministic fast-path classifier: obvious-trivial → economical tier,
 * obvious-complex → frontier tier, otherwise ambiguous for deeper stages.
 *
 * Pipeline: sanitize (T026, FR-004) → Aho-Corasick keyword scan (T025) →
 *           cyclomatic scan (T025b) → verdict.
 */
export type TriageVerdict = 'trivial' | 'complex' | 'ambiguous';
export interface TriageResult {
    readonly verdict: TriageVerdict;
    readonly reason_code: string;
    readonly trivial_hits: number;
    readonly complex_hits: number;
    readonly cyclomatic_score: number;
    readonly sanitized_length_delta: number;
}
export declare const CYCLOMATIC_THRESHOLD = 15;
/**
 * Strip adversarial complexity-inflation patterns from prompt text (FR-004).
 *
 * Removes base64 blocks, long hex runs, HTML/XML markup, URL-encoded sequences,
 * and excessive character repetition. Preserves newlines and indentation so code
 * blocks remain extractable by the cyclomatic scanner.
 */
export declare function sanitize(raw: string): string;
export declare const TRIVIAL_KEYWORDS: readonly string[];
export declare const COMPLEX_KEYWORDS: readonly string[];
/**
 * Estimate cyclomatic complexity of code embedded in the prompt.
 * Extracts fenced or indented code blocks and counts decision points.
 * Returns 1 (baseline) when no code is detected.
 */
export declare function cyclomaticScan(text: string): number;
/**
 * Classify a prompt as trivial, complex, or ambiguous for fast-path routing.
 *
 * Deterministic and synchronous — runs in the triage pipeline stage (FR-003).
 * Sanitizes adversarial content before scoring (FR-004).
 */
export declare function triage(promptText: string): TriageResult;
//# sourceMappingURL=triage-engine.d.ts.map