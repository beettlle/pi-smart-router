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
import type { Message, TurnType } from '../types/index.js';
export declare function classifyTurnEnvelope(messages: readonly Message[] | undefined): TurnType;
//# sourceMappingURL=turn-envelope.d.ts.map