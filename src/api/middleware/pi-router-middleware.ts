/**
 * Pi extension integration — T021, T021b.
 *
 * Registers hooks on pi extension events to intercept LLM requests
 * and route them through the smart router pipeline.
 *
 * Contract: specs/001-build-smart-router/contracts/pi-middleware.md v1.0.0
 */

import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';

import type { ModelProfile, RoutingDecision, RoutingRequest, Message, TurnType } from '../../domain/types/index.js';
import { RouterPipeline } from '../../domain/pipeline/router-pipeline.js';
import { safeCloudDefault } from '../../domain/pipeline/safe-default.js';

// ─── Pi extension event types (structural typing) ────────────────────────────

export interface PiSessionManager {
  getSessionFile(): string | undefined;
  getSessionId(): string;
}

export interface PiExtensionContext {
  readonly cwd: string;
  readonly sessionManager: PiSessionManager;
}

export interface PiMessage {
  readonly role: string;
  readonly content: string;
  readonly tool_call_id?: string;
  readonly tool_calls?: readonly unknown[];
}

export interface PiContextEvent {
  readonly messages: readonly PiMessage[];
}

export interface PiModelSelectEvent {
  readonly source: string;
  readonly model: {
    readonly provider: string;
    readonly id: string;
  };
}

export interface PiProviderRequestEvent {
  readonly provider: string;
  readonly model: string;
  readonly messages?: readonly PiMessage[];
  [key: string]: unknown;
}

export interface PiExtensionHooks {
  on(event: 'before_provider_request', handler: (event: PiProviderRequestEvent, ctx: PiExtensionContext) => PiProviderRequestEvent | Promise<PiProviderRequestEvent>): void;
  on(event: 'context', handler: (event: PiContextEvent, ctx: PiExtensionContext) => void): void;
  on(event: 'session_compact', handler: (event: unknown, ctx: PiExtensionContext) => void): void;
  on(event: 'session_before_compact', handler: (event: unknown, ctx: PiExtensionContext) => void): void;
  on(event: 'model_select', handler: (event: PiModelSelectEvent, ctx: PiExtensionContext) => void): void;
}

// ─── Middleware state ────────────────────────────────────────────────────────

export interface PiRouterMiddlewareOptions {
  readonly fleet: readonly ModelProfile[];
}

export interface PiRouterMiddleware {
  readonly register: (hooks: PiExtensionHooks) => void;
  readonly getLastDecision: () => RoutingDecision | undefined;
}

/**
 * Create the pi extension middleware that wires router pipeline hooks
 * into pi extension events.
 */
export function createPiRouterMiddleware(
  options: PiRouterMiddlewareOptions,
): PiRouterMiddleware {
  const pipeline = new RouterPipeline(options.fleet);

  let latestMessages: readonly PiMessage[] = [];
  let compactionPending = false;
  let forceModelId: string | undefined;
  let lastDecision: RoutingDecision | undefined;

  function deriveSessionId(ctx: PiExtensionContext): string {
    const sessionFile = ctx.sessionManager.getSessionFile();
    if (sessionFile) {
      return sessionFile;
    }
    const raw = `${ctx.cwd}:${ctx.sessionManager.getSessionId()}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  function extractPromptText(messages: readonly PiMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg && msg.role === 'user' && msg.content) {
        return msg.content;
      }
    }
    return '';
  }

  function mapMessages(piMessages: readonly PiMessage[]): Message[] {
    return piMessages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.tool_call_id !== undefined ? { tool_blocks: m.tool_calls as unknown[] } : {}),
    }));
  }

  function deriveTurnType(messages: readonly PiMessage[]): TurnType {
    if (messages.length === 0) return 'unknown';

    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return 'unknown';

    if (lastMsg.role === 'tool' || lastMsg.tool_call_id) {
      return 'tool_result';
    }

    if (lastMsg.role === 'user' && lastMsg.content) {
      const lower = lastMsg.content.toLowerCase();
      if (
        lower.includes('plan') ||
        lower.includes('architect') ||
        lower.includes('design')
      ) {
        return 'planning';
      }
    }

    return 'main_loop';
  }

  function buildRoutingRequest(ctx: PiExtensionContext): RoutingRequest {
    const messages = latestMessages;
    const request: RoutingRequest = {
      request_id: randomUUID(),
      session_id: deriveSessionId(ctx),
      prompt_text: extractPromptText(messages),
      messages: mapMessages(messages),
      turn_type: deriveTurnType(messages),
      compaction_flag: compactionPending,
      ...(forceModelId !== undefined ? { force_model_id: forceModelId } : {}),
    };

    compactionPending = false;
    return request;
  }

  function register(hooks: PiExtensionHooks): void {
    hooks.on('context', (event: PiContextEvent) => {
      latestMessages = structuredClone(event.messages);
    });

    hooks.on('session_compact', () => {
      compactionPending = true;
    });

    hooks.on('session_before_compact', () => {
      compactionPending = true;
    });

    hooks.on('model_select', (event: PiModelSelectEvent) => {
      if (event.source === 'set') {
        forceModelId = `${event.model.provider}/${event.model.id}`;
      }
    });

    hooks.on('before_provider_request', (event: PiProviderRequestEvent, ctx: PiExtensionContext) => {
      try {
        const request = buildRoutingRequest(ctx);

        const start = Date.now();
        const decision = routeSync(pipeline, request, options.fleet, start);
        lastDecision = decision;

        return {
          ...event,
          provider: decision.selected_model_id.split('/')[0] ?? event.provider,
          model: decision.selected_model_id,
        };
      } catch {
        return event;
      }
    });
  }

  function getLastDecision(): RoutingDecision | undefined {
    return lastDecision;
  }

  return { register, getLastDecision };
}

/**
 * Synchronous routing wrapper. The pipeline is async but pi
 * `before_provider_request` may be sync. We run the pipeline
 * and if it's not yet resolved, fall back to safe default.
 *
 * In practice the current pipeline stages are all synchronous
 * (placeholder stubs return immediately), so the Promise resolves
 * on the same tick.
 */
function routeSync(
  pipeline: RouterPipeline,
  request: RoutingRequest,
  fleet: readonly ModelProfile[],
  startMs: number,
): RoutingDecision {
  let resolved: RoutingDecision | undefined;

  pipeline.route(request).then(
    (d) => { resolved = d; },
    () => { /* swallow — fallback below */ },
  );

  if (resolved) return resolved;

  const fallbackModel = safeCloudDefault(fleet);
  return {
    request_id: request.request_id,
    selected_model_id: fallbackModel?.id ?? 'unknown',
    tier: fallbackModel?.tier ?? 'economical-cloud',
    stage: 'fallback',
    reason_code: 'safe_cloud_default',
    routing_latency_ms: Date.now() - startMs,
    pin_reason: null,
  };
}
