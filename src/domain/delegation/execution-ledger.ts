/**
 * Tracks the last successfully executing model per session.
 *
 * Used to rewrite virtual smart-router assistant identity on replay so pi-ai
 * transformMessages sees the model that actually produced prior turns.
 */

import type { Api } from '@earendil-works/pi-ai/compat';

export interface ExecutionModel {
  readonly provider: string;
  readonly api: Api;
  readonly id: string;
}

export class ExecutionLedger {
  private readonly bySession = new Map<string, ExecutionModel>();

  recordSuccess(sessionId: string, model: ExecutionModel): void {
    this.bySession.set(sessionId, {
      provider: model.provider,
      api: model.api,
      id: model.id,
    });
  }

  getLastExecution(sessionId: string): ExecutionModel | null {
    return this.bySession.get(sessionId) ?? null;
  }

  clear(sessionId: string): void {
    this.bySession.delete(sessionId);
  }
}
