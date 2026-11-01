/**
 * typed_judgment stage (SP-307, GitHub #187 / epic #183) — non-deciding, fail-open.
 *
 * Computes one typed judgment per user-prompt turn via the SP-304
 * {@link TypedJudgmentPort} and stores the normalized signal (SP-306
 * `mapTypedJudgment`) on {@link RoutingContext} for later consumers
 * (low_intensity / local_zero / hydra_match / adaptive reasoning — later
 * trains #188–#190). This stage **never decides**: it always returns
 * `decided: false`, and any timeout, error, or abort leaves
 * `context.typedJudgment = null` with a `typed_judgment_*` skip reason so
 * every later stage behaves exactly as when the stage is unwired.
 *
 * Stage position: directly after `turn_envelope` and before `context_fit`
 * (the first stage that can early-exit on a cheap tier), so the judgment is
 * available to every downstream consumer.
 *
 * Latency note: `route()` is serialized per pipeline (SP-230), so judge
 * latency adds to user-turn routing latency only; `tool_result` turns (and
 * disabled configs) pay nothing — the port is never invoked.
 *
 * Privacy: the judge state is built by SP-306 `buildJudgeState` (token-capped,
 * no spend/budget keys). Errors are logged redacted via
 * `redactPromptFromError`; prompt or judge-state text is never logged.
 */

import {
  buildJudgeState,
  isAcknowledgement,
  mapTypedJudgment,
  TYPED_JUDGMENT_QUESTIONS,
} from '../judgment/index.js';
import { TypedJudgmentError } from '../ports/typed-judgment-port.js';
import { classifyTurnEnvelope } from '../triage/turn-envelope.js';
import type { Message, RoutingRequest } from '../types/index.js';
import type { PipelineStage, RoutingContext } from './pipeline-stage.js';
import type { StageResult } from './router-pipeline.js';
import { redactPromptFromError } from './stage-helpers.js';

// ─── Skip reason codes ───────────────────────────────────────────────────────

/** Stage unwired (no port / no config) or `typed_judgment.enabled` is false. */
export const TYPED_JUDGMENT_DISABLED = 'typed_judgment_disabled';
/** Tool-result turns never invoke the judge (they pay zero judge latency). */
export const TYPED_JUDGMENT_TOOL_RESULT = 'typed_judgment_tool_result';
/** Acknowledgement-only turn (SP-306 `isAcknowledgement`) — no judgment needed. */
export const TYPED_JUDGMENT_ACKNOWLEDGEMENT = 'typed_judgment_acknowledgement';
/** Explicit force_model_id override — judgment would not influence routing. */
export const TYPED_JUDGMENT_FORCE_MODEL = 'typed_judgment_force_model';
/** Judge call hit the `timeout_ms` budget or was aborted. */
export const TYPED_JUDGMENT_TIMEOUT = 'typed_judgment_timeout';
/** Judge call or answer mapping failed (fail open). */
export const TYPED_JUDGMENT_ERROR = 'typed_judgment_error';

/** Skip result helper — records the reason and never decides. */
function skip(context: RoutingContext, reason: string): StageResult {
  context.typedJudgment = null;
  context.typedJudgmentSkipReason = reason;
  context.typedJudgmentLatencyMs = null;
  return { decided: false, stage: 'typed_judgment' };
}

/**
 * Latest user message text (mirrors SP-306 `buildJudgeState` precedence):
 * the last non-empty `user` message, else `prompt_text`. `prompt_text` is a
 * required wire field, so every non-tool_result turn carries a user message.
 */
function resolveLatestUserMessageText(request: RoutingRequest): string {
  const messages = request.messages;
  if (messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message: Message = messages[i]!;
      if (message.role === 'user' && message.content.trim()) {
        return message.content;
      }
    }
  }
  return request.prompt_text;
}

/** Judge-call timeout classification: explicit abort/timeout kinds or a fired signal. */
function isTimeoutLike(error: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  return (
    error instanceof TypedJudgmentError &&
    (error.kind === 'timeout' || error.kind === 'aborted')
  );
}

/**
 * Step 2a+: compute the typed judgment for user-prompt turns.
 * Skip reasons: disabled / tool_result / acknowledgement / force_model;
 * failure reasons: timeout / error. Always `decided: false` (fail open).
 */
export function createTypedJudgmentStage(): PipelineStage {
  return {
    name: 'typed_judgment',
    async run(context: RoutingContext): Promise<StageResult> {
      const { request } = context;
      const port = context.options.typedJudgmentPort;
      const config = context.options.typedJudgmentConfig;

      if (!port || !config || !config.enabled) {
        return skip(context, TYPED_JUDGMENT_DISABLED);
      }

      // SP-209 parity with turn_envelope: an explicit force is resolved by
      // session_pin; a judgment cannot influence that path.
      if (request.force_model_id) {
        return skip(context, TYPED_JUDGMENT_FORCE_MODEL);
      }

      const turnType = request.turn_type ?? classifyTurnEnvelope(request.messages);
      if (turnType === 'tool_result') {
        return skip(context, TYPED_JUDGMENT_TOOL_RESULT);
      }

      const userText = resolveLatestUserMessageText(request);
      // An empty user message (degenerate blank prompt) carries no judgeable
      // instruction — treat it like an acknowledgement-class no-op turn.
      if (
        !userText.trim() ||
        isAcknowledgement(userText, {
          sessionDepth: request.messages?.length ?? 0,
        })
      ) {
        return skip(context, TYPED_JUDGMENT_ACKNOWLEDGEMENT);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, config.timeout_ms);

      const startedAt = Date.now();
      try {
        const state = buildJudgeState(request);
        const answers = await port.judge(state, TYPED_JUDGMENT_QUESTIONS, {
          signal: controller.signal,
        });
        context.typedJudgment = mapTypedJudgment(answers);
        context.typedJudgmentSkipReason = null;
        context.typedJudgmentLatencyMs = Date.now() - startedAt;
        return { decided: false, stage: 'typed_judgment' };
      } catch (error: unknown) {
        const reason = isTimeoutLike(error, controller.signal)
          ? TYPED_JUDGMENT_TIMEOUT
          : TYPED_JUDGMENT_ERROR;
        const latencyMs = Date.now() - startedAt;
        console.warn('typed_judgment stage failed; continuing without judgment', {
          stage: 'typed_judgment',
          reason,
          request_id: request.request_id,
          session_id: request.session_id,
          error: redactPromptFromError(error, request.prompt_text),
        });
        const result = skip(context, reason);
        // Judge was invoked — keep latency even though the outcome is a skip.
        context.typedJudgmentLatencyMs = latencyMs;
        return result;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
